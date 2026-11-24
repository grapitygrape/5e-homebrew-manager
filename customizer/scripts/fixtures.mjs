// Temp git repos for the tests: a fake upstream and a site cloned from it.
import {execFileSync} from "node:child_process";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";

export const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "core.autocrlf=false", ...args], {cwd, encoding: "utf8"});

export const write = async (file, text) => {
	await fs.mkdir(path.dirname(file), {recursive: true});
	await fs.writeFile(file, text);
};

// Upstream pins LF, so clones match whatever core.autocrlf says.
const UPSTREAM_FILES = {
	".gitattributes": "* text=auto eol=lf\n",
	"index.html": "<p>home</p>\n",
	"bestiary/index.html": "<p>seo</p>\n",
	"css/main.css": "body {}\n",
	"js/a.js": "const a = 1;\n",
	"scss/b.scss": "$b: 1;\n",
	"node/gen.js": "export default 1;\n",
	"homebrew/index.json": "{\"toImport\": []}\n",
	"search/index.json": "[]\n",
	"package.json": "{\"scripts\": {}}\n",
	"fonts/majesty-bold.woff2": "font\n",
	"data/spells.json": "{}\n",
};

export const makeUpstream = async () => {
	const base = await fs.mkdtemp(path.join(os.tmpdir(), "customizer-"));
	const upstream = path.join(base, "upstream");
	for (const [rel, text] of Object.entries(UPSTREAM_FILES)) await write(path.join(upstream, rel), text);
	git(base, "init", "-q", "-b", "main", upstream);
	git(upstream, "add", "-A");
	git(upstream, "commit", "-q", "-m", "v1");
	return {base, upstream, commit: git(upstream, "rev-parse", "HEAD").trim()};
};

// A site with one commit on top of upstream, an uncommitted edit and an untracked file,
// plus edits to paths the patch must leave out.
export const makeSite = async ({base, upstream}) => {
	const site = path.join(base, "site");
	git(base, "clone", "-q", "-c", "core.autocrlf=false", "-o", "upstream", upstream, site);
	await write(path.join(site, "js/a.js"), "const a = 2;\n");
	git(site, "commit", "-q", "-am", "ours");
	await write(path.join(site, "scss/b.scss"), "$b: 2;\n");
	await write(path.join(site, "js/new.js"), "export const added = true;\n");
	await write(path.join(site, "index.html"), "<p>generated</p>\n");
	await write(path.join(site, "bestiary/index.html"), "<p>generated seo</p>\n");
	await write(path.join(site, "css/main.css"), "body { color: red; }\n");
	await write(path.join(site, "homebrew/index.json"), "{\"toImport\": [\"Brew.json\"]}\n");
	await write(path.join(site, "search/index.json"), "[1]\n");
	await write(path.join(site, "fonts/majesty-bold.woff2"), "other font\n");
	await write(path.join(site, "shell/new.css"), "a {}\n");
	return site;
};
