// Regenerates the site's pages, search index and CSS from source, then reapplies the
// pages generation can't produce. Run this rather than editing the generated .html,
// css/ or search/ files.
import {execSync} from "node:child_process";
import {promises as fs} from "node:fs";
import path from "node:path";
import {adSlotsInHtml} from "../scripts/ad-slots.mjs";
import {repoRoot, siteRoot} from "../scripts/paths.mjs";
import {adoptShell} from "./adopt-shell.mjs";

const site = siteRoot();

execSync("npm run gen:pages", {cwd: site, stdio: "inherit"});
execSync("npm run gen:search-index", {cwd: site, stdio: "inherit"});
execSync("npm run build:css", {cwd: site, stdio: "inherit"});
const home = await fs.readFile(path.join(repoRoot, "shell", "overrides", "index.html"), "utf8");
await fs.writeFile(path.join(site, "index.html"), adoptShell(home, "index.html"));

// Upstream's ad slots must not survive into any page; see scripts/ad-slots.mjs.
const pages = (await fs.readdir(site)).filter(f => f.endsWith(".html"));
const withAds = [];
for (const page of pages) {
	const found = adSlotsInHtml(await fs.readFile(path.join(site, page), "utf8"));
	if (found.length) withAds.push(`  ${page}: ${[...new Set(found)].join(", ")}`);
}
if (withAds.length) {
	console.error(`Ad slot markup left in ${withAds.length} page(s):\n${withAds.join("\n")}`);
	process.exitCode = 1;
} else console.log(`Shell build done in ${site}.`);
