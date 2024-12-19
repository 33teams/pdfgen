import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { renderText, renderUrl } from "./puppeteer.js";

const {
	values: { input, output, url },
} = parseArgs({
	allowPositionals: false,
	options: {
		input: { short: "i", type: "string" },
		output: { short: "o", type: "string" },
		url: { short: "u", type: "string" },
	},
	strict: true,
});

try {
	const data = await (url
		? renderUrl(new URL(url))
		: renderText(await readFile(input, "utf-8")));
	await writeFile(output, data);
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
