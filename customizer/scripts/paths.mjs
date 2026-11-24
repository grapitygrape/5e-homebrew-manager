// Where everything lives. This folder sits inside 5e-homebrew-manager. The Tools source
// comes from the manager's Settings; without it, a 5e folder beside the manager is used.
// The licensed fonts come from the manager's data folder, the one holding its config. Build sibling paths from webRoot only: the
// manager can hold its own untracked 5e/ folder, and a "../5e" from here would land in it.
// The site's path comes from HBM_SITE, then local.json (written by setup), then
// homebrew-tools beside the manager.
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {resolveConfigPath} from "../../src/lib/server/config-path.ts";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const managerRoot = path.dirname(repoRoot);
export const webRoot = path.dirname(managerRoot);
export const localPath = path.join(repoRoot, "local.json");
export const assetsDir = path.join(repoRoot, "assets");
export const patchPath = path.join(repoRoot, "upstream.patch");
export const upstreamPath = path.join(repoRoot, "upstream.json");
export const DEFAULT_SITE = path.join(webRoot, "homebrew-tools");
export const UPSTREAM_REMOTE = "https://github.com/5etools-mirror-3/5etools-src.git";

// The manager's hbm-config.json, as its Settings page saved it.
export const managerConfigPath = () => resolveConfigPath({env: process.env, cwd: managerRoot, platform: process.platform, home: os.homedir(), exists: existsSync});
export const readManagerConfig = () => {
	try {
		return JSON.parse(readFileSync(managerConfigPath(), "utf8"));
	} catch {
		return {};
	}
};

// Settings > Repos "Tools source", or the folder above Settings > Sources "Source data"
// in older configs. Relative paths resolve from the manager, as they do in the app.
export const settingsPaths = (config, {manager = managerRoot, web = webRoot} = {}) => {
	const abs = p => (typeof p === "string" && p.trim() ? path.resolve(manager, p.trim()) : "");
	const dataPath = abs(config?.data?.path);
	return {
		toolsSource: abs(config?.sourceRepos?.tools?.path) || (dataPath && path.dirname(dataPath)) || path.join(web, "5e"),
	};
};

// Images and homebrew are read from the Tools source, so the site needn't hold them.
const fromSettings = settingsPaths(readManagerConfig());
export const imageRoot = fromSettings.toolsSource;
export const IMAGE_DIRS = ["img", "homebrew-img", "homebrew"];

// The manager's data folder: what `{data}` means in its deploy modules.
export const dataDir = path.dirname(managerConfigPath());

// Files the shell needs, by site path, and where each comes from. The licensed fonts are in
// the data folder (its fonts/README.md lists them), the textures in assets/, and the
// fallback font lives in deploy-modules/_shared/nodesto.
export const assetSources = (data = dataDir) => ({
	"fonts/majesty-bold.woff2": path.join(data, "fonts", "majesty-bold.woff2"),
	"fonts/majesty-black.woff2": path.join(data, "fonts", "majesty-black.woff2"),
	"hbm/modesto-condensed/modesto-condensed.woff2": path.join(data, "fonts", "modesto-condensed.woff2"),
	"hbm/nodesto": path.join(managerRoot, "deploy-modules", "_shared", "nodesto"),
	"watercolor-light.webp": path.join(assetsDir, "watercolor-light.webp"),
	"watercolor-dark.webp": path.join(assetsDir, "watercolor-dark.webp"),
	"paper_fibers_light.webp": path.join(assetsDir, "paper_fibers_light.webp"),
	"paper_fibers_dark.webp": path.join(assetsDir, "paper_fibers_dark.webp"),
});
export const ASSET_SOURCES = assetSources();
export const ASSETS = Object.keys(ASSET_SOURCES);

// The file behind a site path inside an asset, or null when it isn't one.
export const assetFile = (rel, sources = ASSET_SOURCES) => {
	for (const [site, source] of Object.entries(sources)) {
		if (rel === site) return source;
		if (rel.startsWith(`${site}/`)) return path.join(source, rel.slice(site.length + 1));
	}
	return null;
};

export const resolveSite = ({env, localJson, repoRoot, defaultSite = DEFAULT_SITE}) => {
	const fromEnv = env.HBM_SITE?.trim();
	return path.resolve(repoRoot, fromEnv || localJson?.site || defaultSite);
};

export const readLocal = () => {
	try {
		return JSON.parse(readFileSync(localPath, "utf8"));
	} catch {
		return {};
	}
};

export const writeLocal = values => writeFileSync(localPath, `${JSON.stringify({...readLocal(), ...values}, null, "\t")}\n`);

export const siteRoot = () => resolveSite({env: process.env, localJson: readLocal(), repoRoot});
