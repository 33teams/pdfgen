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
		{
			displayHeaderFooter: false,
			margin: undefined,
			printBackground: true,
		},
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
		{
			displayHeaderFooter: false,
			margin: undefined,
			printBackground: true,
		},
	);
}

/**
 * @param {(page: import("puppeteer").Page) => Promise<void>} loadContent
 * @param {{ paged: boolean }=} options
 * @param {import("puppeteer").PDFOptions=} pdfOptions
 * @returns {Promise<Uint8Array>}
 */
async function getPdfData(loadContent, { paged } = {}, pdfOptions = {}) {
	const browser = await puppeteer.launch({
		args: ["--disable-dev-shm-usage", "--export-tagged-pdf"],
		dumpio: true,
	});
	const page = await browser.newPage();
	await logEvents(page);
	await skipRequests(page, [
		"cdn.syndication.twimg.com",
		"embed.typeform.com",
		"platform.twitter.com",
	]);
	await loadContent(page);
	if (paged) {
		pdfOptions.preferCSSPageSize ??= true;
		await applyPagedJs(page);
	}
	return page.pdf({ ...pdfOptions }).finally(() => browser.close());
}

/**
 * Add {@link https://pagedjs.org/|Paged.js} and wait for it to render.
 *
 * @param {import("puppeteer").Page} page
 * @returns {Promise<void>}
 */
async function applyPagedJs(page) {
	const propertyName = "__pagedjs_render_complete__";
	await page.evaluate(() => {
		window.PagedConfig = { auto: false };
	});
	await page.addScriptTag({
		url: "https://unpkg.com/pagedjs@0.5.0-beta.2/dist/paged.polyfill.min.js",
	});
	await page.evaluate(
		({ propertyName }) => {
			window[propertyName] = null;
			console.info("render started");
			/**
			 * Register custom
			 * {@link https://pagedjs.org/documentation/10-handlers-hooks-and-custom-javascript/|handler}
			 * to report on granular Paged events
			 */
			window.Paged.registerHandlers(class LoggingHandler extends window.Paged.Handler {
				constructor(chunker, polisher, caller) {
					super(chunker, polisher, caller);
					this.page = 1;
				}
				//#region previewer
				afterPreview(pages) {
					console.info(`previewed ${pages.length} pages`);
				}
				//#endregion
				//#region chunker
				beforeParsed() {
					console.debug("beforeParsed");
				}
				afterParsed() {
					console.debug("afterParsed");
				}
				beforePageLayout() {
					console.debug(`beforePageLayout - page ${this.page}`);
				}
				afterPageLayout() {
					console.debug(`afterPageLayout - page ${this.page}`);
					this.page++;
				}
				afterRendered(pages) {
					console.info(`chunked ${pages.length} pages`);
				}
				//#endregion
			});
			window.PagedPolyfill.preview()
				.then(() => {
					console.info("render complete");
					window[propertyName] = true;
				})
				.catch((err) => {
					console.error(err);
					window[propertyName] = false;
				});
		},
		{ propertyName },
	);
	await page.waitForFunction(
		({ propertyName }) => window[propertyName] !== null,
		{ polling: 500, timeout: 120_000 },
		{ propertyName },
	);
	const success = await page.evaluate(
		({ propertyName }) => {
			return window[propertyName];
		},
		{ propertyName },
	);
	if (success === false) {
		throw new Error("rendering failed");
	}
}

/**
 * @param {import("puppeteer").Page} page
 * @param {string[]} hosts
 * @returns {Promise<void>}
 */
async function skipRequests(page, hosts) {
	await page.setRequestInterception(true);
	page.on("request", (req) => {
		const url = new URL(req.url());
		if (hosts.includes(url.host)) {
			req.abort("failed");
			return;
		}
		if (url.protocol !== "data:") {
			console.info("%s %s", req.method(), req.url());
		}
		req.continue();
	});
}

/**
 * @param {import("puppeteer").Page} page
 * @returns {Promise<void>}
 */
async function logEvents(page) {
	page.on("console", (message) => {
		const type = message.type();
		const text = message.text();
		const args =
			text === "JSHandle@error"
				? message
						.args()
						.map((arg) => arg.remoteObject().description ?? "<no description>")
				: [text];
		switch (type) {
			case "error":
			case "debug":
			case "info":
			case "trace":
			case "warn":
				console[type]("[BROWSER] %s", ...args);
				break;
			default:
				console.log("[BROWSER] %s", ...args);
		}
	});
	page.on("error", (err) => console.error("[BROWSER]", err));
	page.on("pageerror", (err) => console.error("[BROWSER]", err));
}
