// Joins shell.css and everything it imports into the one file the site loads as
// css/shell.css. The dev server serves this on each request and the export writes
// it, so what you see on :5175 is what deploys. Plain Node: no CSS tooling needed.
import {promises as fs} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const shellDir = path.dirname(fileURLToPath(import.meta.url));
const IMPORT = /@import\s+"([^"]+)"(?:\s+layer\(([\w-]+)\))?\s*;/g;
const URL_REF = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

// Skips quoted strings, so a "/*" inside one stays.
const stripComments = css => {
	let out = "";
	for (let i = 0; i < css.length; i++) {
		const ch = css[i];
		if (ch === "\"" || ch === "'") {
			const end = css.indexOf(ch, i + 1);
			const stop = end === -1 ? css.length : end + 1;
			out += css.slice(i, stop);
			i = stop - 1;
		} else if (ch === "/" && css[i + 1] === "*") {
			const end = css.indexOf("*/", i + 2);
			i = end === -1 ? css.length : end + 1;
		} else out += ch;
	}
	return out;
};

// Paths in the shell files are relative to shell/; the bundle lives in css/.
const rewriteUrls = (css, fromDir) => {
	const found = [...css.matchAll(URL_REF)];
	let out = css;
	for (const [whole, , ref] of found) {
		if (/^(data:|https?:|\/|#)/.test(ref)) continue;
		const abs = path.resolve(fromDir, ref);
		const rel = path.relative(path.join(shellDir, "..", "css"), abs).split(path.sep).join("/");
		out = out.replace(whole, `url("${rel}")`);
	}
	return out;
};

const inline = async file => {
	const dir = path.dirname(file);
	const css = stripComments(await fs.readFile(file, "utf8"));
	let out = "";
	let last = 0;
	for (const match of css.matchAll(IMPORT)) {
		out += css.slice(last, match.index);
		const body = await inline(path.join(dir, match[1]));
		out += match[2] ? `@layer ${match[2]} {\n${body}\n}\n` : `${body}\n`;
		last = match.index + match[0].length;
	}
	out += css.slice(last);
	return rewriteUrls(out, dir);
};

export const bundleShellCss = async () => {
	const css = await inline(path.join(shellDir, "shell.css"));
	return `${css.replace(/\n\s*\n+/g, "\n").trim()}\n`;
};
