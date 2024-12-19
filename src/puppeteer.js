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
		await page.goto(url.toString(), WAIT_FOR);
	});
}

/**
 * @param {(page: import("puppeteer").Page) => Promise<void>} loadContent
 * @param {import("puppeteer").PDFOptions=} options
 * @returns {Promise<Uint8Array>}
 */
async function getPdfData(loadContent, options) {
	const browser = await puppeteer.launch({ dumpio: true });
	const page = await browser.newPage();
	page.on("console", (message) => console[message.type()]("[BROWSER]", message.text()));
	await loadContent(page);
	await page.evaluate(() => {
		window.__pagedjs_render_complete__ = false;
		window.PagedConfig = {
			auto: true,
			after() {
				console.debug("render complete");
				window.__pagedjs_render_complete__ = true;
			},
		};
	})
	await page.addScriptTag({ url: "https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.min.js" });
	await page.waitForFunction(() => window.__pagedjs_render_complete__ === true)
	return page.pdf({ ...options, preferCSSPageSize: true }).finally(() => browser.close());
}
