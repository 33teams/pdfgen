import puppeteer from "puppeteer";

/** @type {import("puppeteer").WaitForOptions} */
const WAIT_FOR = {
	waitUntil: ["domcontentloaded", "networkidle0"],
};

/**
 * @param {string} text
 * @returns {Promise<Uint8Array>}
 */
export async function renderText(text) {
	return getPdfData(async (page) => {
		await page.setContent(text, WAIT_FOR);
	});
}

/**
 * @param {URL} url
 * @returns {Promise<Uint8Array>}
 */
export async function renderUrl(url) {
	return getPdfData(async (page) => {
		await page.goto(url.toString());
	});
}

/**
 * @param {(page: import("puppeteer").Page) => Promise<void>} loadContent
 * @returns {Promise<Uint8Array>}
 */
async function getPdfData(loadContent) {
	const browser = await puppeteer.launch({ dumpio: true });
	const page = await browser.newPage();
	page.on("console", (message) => console[message.type()]("[BROWSER]", message.text()));
	await loadContent(page);
	return page.pdf().finally(() => browser.close());
}
