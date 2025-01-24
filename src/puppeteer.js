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
	const browser = await puppeteer.launch({
		args: ["--disable-dev-shm-usage", "--export-tagged-pdf"],
		dumpio: true,
	});
	const page = await browser.newPage();
	await logEvents(page);
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
 * @returns {Promise<void>}
 */
async function logEvents(page) {
	await page.setRequestInterception(true);
	page.on("request", (req) => {
		const url = new URL(req.url());
		if (
			[
				"cdn.syndication.twimg.com",
				"embed.typeform.com",
				"platform.twitter.com",
			].includes(url.host)
		) {
			req.abort();
			return;
		}
		if (url.protocol !== "data:") {
			console.info("%s %s", req.method(), req.url());
		}
		req.continue();
	});
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
