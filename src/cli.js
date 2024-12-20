import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { renderText, renderUrl } from "./puppeteer.js";

const {
	values: { input, output, paged, url },
} = parseArgs({
	allowNegative: true,
	allowPositionals: false,
	options: {
		input: { short: "i", type: "string" },
		output: { short: "o", type: "string" },
		paged: { short: "p", type: "boolean", default: true },
		url: { short: "u", type: "string" },
	},
	strict: true,
});

try {
	const data = await (url
		? renderUrl(new URL(url), paged)
		: renderText(await readFile(input, "utf-8"), paged));
	await writeFile(output, data);
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
