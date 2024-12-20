import puppeteer from "puppeteer";

/** @type {import("puppeteer").WaitForOptions} */
const WAIT_FOR = {
	waitUntil: ["domcontentloaded", "networkidle0"],
};

/**
 * @param {string} text
 * @param {boolean} paged
 * @returns {Promise<Uint8Array>}
 */
export async function renderText(text, paged) {
	return getPdfData(
		async (page) => {
			await page.setContent(text, WAIT_FOR);
		},
		{ paged },
	);
}

/**
 * @param {URL} url
 * @param {boolean} paged
 * @returns {Promise<Uint8Array>}
 */
export async function renderUrl(url, paged) {
	return getPdfData(
		async (page) => {
			await page.goto(url.toString(), WAIT_FOR);
		},
		{ paged },
	);
}

/**
 * @param {(page: import("puppeteer").Page) => Promise<void>} loadContent
 * @param {{ paged: boolean }=} options
 * @param {import("puppeteer").PDFOptions=} puppeteerOptions
 * @returns {Promise<Uint8Array>}
 */
async function getPdfData(loadContent, { paged } = {}, puppeteerOptions = {}) {
	const browser = await puppeteer.launch({ dumpio: true });
	const page = await browser.newPage();
	page.on("console", (message) =>
		console[message.type()]("[BROWSER]", message.text()),
	);
	await loadContent(page);
	if (paged) {
		puppeteerOptions.preferCSSPageSize ??= true;
		await applyPagedJs(page);
	}
	return page.pdf({ ...puppeteerOptions }).finally(() => browser.close());
}

/**
 * Add {@link https://pagedjs.org/|Paged.js} and wait for it to render.
 *
 * @param {import("puppeteer").Page} page
 * @returns {Promise<void>}
 */
async function applyPagedJs(page) {
	const propertyName = "__pagedjs_render_complete__";
	await page.evaluate(
		({ propertyName }) => {
			window[propertyName] = false;
			window.PagedConfig = {
				auto: true,
				after() {
					console.debug("render complete");
					window[propertyName] = true;
				},
			};
		},
		{ propertyName },
	);
	await page.addScriptTag({
		url: "https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.min.js",
	});
	await page.waitForFunction(
		({ propertyName }) => window[propertyName] === true,
		{ polling: 500 },
		{ propertyName },
	);
}
