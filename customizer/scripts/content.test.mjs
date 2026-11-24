// node --test scripts/
// What may be committed in shell/: none of upstream's ads.
import assert from "node:assert/strict";
import {promises as fs} from "node:fs";
import path from "node:path";
import test from "node:test";
import {repoRoot} from "./paths.mjs";

test("nothing in shell/ mentions cancer", async () => {
	const hits = [];
	const walk = async dir => {
		for (const ent of await fs.readdir(dir, {withFileTypes: true})) {
			const file = path.join(dir, ent.name);
			if (ent.isDirectory()) await walk(file);
			else if (/cancer/i.test(await fs.readFile(file, "utf8"))) hits.push(path.relative(repoRoot, file));
		}
	};
	await walk(path.join(repoRoot, "shell"));
	assert.deepEqual(hits, []);
});
