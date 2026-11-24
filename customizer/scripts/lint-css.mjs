// Lints shell/*.css with the site's stylelint and config, so the rules are upstream's
// and this repo needs no dependencies of its own.
import {spawnSync} from "node:child_process";
import path from "node:path";
import {repoRoot, siteRoot} from "./paths.mjs";

const site = siteRoot();
const bin = path.join(site, "node_modules", "stylelint", "bin", "stylelint.mjs");
const {status} = spawnSync(process.execPath, [bin, "--config", path.join(site, ".stylelintrc.json"), "shell/*.css"], {cwd: repoRoot, stdio: "inherit"});
process.exitCode = status ?? 1;
