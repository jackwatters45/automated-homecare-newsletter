// browser.ts
import puppeteer from "puppeteer";

let browserInstance: puppeteer.Browser | null = null;
let browserLastUsed = Date.now();

export async function getBrowser() {
	if (!browserInstance || Date.now() - browserLastUsed > 30 * 60 * 1000) {
		// Recreate browser if it doesn't exist or hasn't been used in 30 minutes
		if (browserInstance) {
			await browserInstance.close();
		}
		browserInstance = await puppeteer.launch({
			headless: true,
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-dev-shm-usage",
			],
			defaultViewport: null,
		});
	}
	browserLastUsed = Date.now();

	return browserInstance;
}

export async function closeBrowser() {
	if (browserInstance) {
		await browserInstance.close();
		browserInstance = null;
	}
}

// Periodically check and close idle browser
setInterval(
	async () => {
		if (browserInstance && Date.now() - browserLastUsed > 30 * 60 * 1000) {
			await closeBrowser();
		}
	},
	5 * 60 * 1000,
); // Check every 5 minutes

process.on("exit", closeBrowser);
process.on("SIGINT", async () => {
	await closeBrowser();
	process.exit(0);
});
