// Writes upstream.patch and upstream.json from the site. Run after editing upstream
// files in the site, and after a rebase onto a new upstream release.
//   npm run save-patch
import {execFileSync} from "node:child_process";
import {promises as fs} from "node:fs";
import {pathToFileURL} from "node:url";
import {adSlotsInPatch} from "./ad-slots.mjs";
import {buildPatch, findBase, patchFiles, patchHeader} from "./patch.mjs";
import {patchPath, siteRoot, upstreamPath} from "./paths.mjs";

export const savePatch = async ({site, patchPath, upstreamPath}) => {
	const base = findBase(site);
	const remote = execFileSync("git", ["remote", "get-url", "upstream"], {cwd: site, encoding: "utf8"}).trim();
	const patch = buildPatch(site, base.commit);
	const adSlots = adSlotsInPatch(patch);
	if (adSlots.length) {
		const lines = adSlots.map(h => `  ${h.file}: ${h.text.trim()}`).join("\n");
		throw new Error(`Not saved: these added lines bring back upstream's ad slots ("cancer"). Remove them in the site first.\n${lines}`);
	}
	await fs.writeFile(patchPath, patchHeader(base) + patch);
	await fs.writeFile(upstreamPath, `${JSON.stringify({remote, ...base}, null, "\t")}\n`);
	return {base, files: patchFiles(patch)};
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const site = siteRoot();
	try {
		const {base, files} = await savePatch({site, patchPath, upstreamPath});
		console.log(`Saved ${files.length} files from ${site}, on upstream ${base.describe} (${base.commit.slice(0, 7)})`);
	} catch (e) {
		console.error(e.message);
		process.exitCode = 1;
	}
}
