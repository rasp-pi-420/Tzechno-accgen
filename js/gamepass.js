const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth")();
chromium.use(stealth);
const noblox = require("noblox.js");
const axios = require("axios").default;
const fs = require("fs");
const fg = require("fast-glob");
const config = require("../config.json");
let retry = true;
let file = JSON.parse(fs.readFileSync("./accounts.json"));
let user = file.filter(function (item) {
	return item.Username == process.argv[2];
});
if (user.length == 0) return console.log("user not found");
const gamepassPrices = config.gamepasses || [5, 10, 25, 50, 100, 250, 1000, 5000, 10000, 100000, 1000000];
const gamepassNames = config.gamepassNames;
(async () => {
	await noblox.setCookie(user[0].Cookie);
	let gameId;
	let placeId;
	await axios.get(`https://games.roblox.com/v2/users/${user[0].UserID}/games?sortOrder=Asc&limit=50`).then(function (response) {
		gameId = response.data.data[0].id;
		placeId = response.data.data[0].rootPlace.id;
	});
	let replaced = await noblox.getGamePasses(gameId);
	let cookies = [
		{
			name: ".ROBLOSECURITY",
			value: user[0].Cookie,
			domain: ".roblox.com",
			path: "/",
		},
	];
	const browser = await chromium.launch();
	const browserContext = await browser.newContext();
	const page = await browserContext.newPage();
	await browserContext.addCookies(cookies);
	await page.goto(`https://www.roblox.com/build/upload?AssetTypeId=34&GroupId=&TargetPlaceId=${placeId}`, { waitUntil: "networkidle" });
	async function create(gp) {
		try {
			await page.click("#upload-button");
		} catch (e) {}
		try {
			await page.waitForSelector("#upload-button");
			let upload = await page.$("input[type=file]");
			let file = Object.values(fg.sync(`./gamepasses/${gamepassPrices[gp]}.*`))[0] || "./gamepasses/default.png";
			await upload.setInputFiles(file);
			await page.locator("#name").fill(gamepassNames[gp] || "Donation");
			await page.click("#upload-button");
			await page.waitForTimeout(1000);
			await page.waitForSelector("#upload-button");
			await page.click("#upload-button");
			await page.waitForTimeout(1000);
			retry = true;
		} catch (e) {
			if (retry == true) {
				retry = false;
				console.log("failed, retrying in 15 seconds");
				console.log(e);
				await page.waitForTimeout(15000);
				await create(gp);
			} else {
				return console.log("failed");
			}
		}
	}
	let gamepass = replaced;
	let gamepassold = 0;
	while (gamepass.length < gamepassPrices.length) {
		await create(gamepass.length);
		try {
			gamepass = await noblox.getGamePasses(gameId);
		} catch (e) {}
		if (gamepassold == gamepass.length - replaced.length || gamepass.length == 0) {
			if (retry == true) {
				let errorCheck = await page.$eval("#upload-result", (element) => element.innerHTML);
				if (errorCheck && errorCheck.includes("inappropriate ")) {
					console.log(errorCheck.red + '\nDefaulting to "Donation"'.red);
					gamepassNames[gamepass.length] = "Donation";
				} else {
					console.log("rate limited, retrying in 15 seconds");
					await page.waitForTimeout(15000);
				}
			} else {
				return;
			}
		} else {
			console.log(`created gamepass ${gamepass.length}/${gamepassPrices.length}`);
		}
		gamepassold = gamepass.length;
	}

	for (let i = 0; i < gamepass.length; ++i) {
		try {
			if (i >= gamepassPrices.length) {
				await noblox.configureGamePass(gamepass[i].id, gamepass[i].name, "", 0);
				console.log(`Disabled gamepass ${i + 1}/${gamepass.length}`);
			} else {
				if (replaced.length > i) {
					let file = Object.values(fg.sync(`./gamepasses/${gamepassPrices[i]}.*`))[0] || "./gamepasses/default.png";
					await noblox.configureGamePass(gamepass[i].id, gamepassNames[i], "", parseInt(gamepassPrices[i]), fs.createReadStream(file));
					console.log(`Replaced gamepass ${i + 1}/${gamepass.length}`);
				} else {
					await noblox.configureGamePass(gamepass[i].id, gamepass[i].name, "", parseInt(gamepassPrices[i]));
					console.log(`Set price ${i + 1}/${gamepass.length}`);
				}
			}
		} catch (e) {
			--i;
			console.log("rate limited, retrying in 15 seconds");
			await page.waitForTimeout(15000);
		}
	}

	await browser.close();
})();
