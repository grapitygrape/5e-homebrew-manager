// Serves files as the manager's deploy modules would leave them, without writing
// anything here. Uses the manager's own patch engine and caches the parsed
// modules + hbm-config.json keyed by file mtimes/sizes, so edits show on reload
// without re-reading every module manifest on every asset request.
// The module with `replaces` (Reskin) is skipped, since this repo is the reskin,
// and so is every module it replaces.
import {promises as fs, readFileSync} from "node:fs";
import path from "node:path";
import {
	applyPatches,
	moduleValues,
	optionAllows,
	resolveModuleSource,
} from "../../src/lib/engine/deploy-modules/apply.ts";

const CSS_MARKER = "/* HBM Custom Styles */";
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const exists = file => fs.stat(file).then(() => true, () => false);

const statSig = async file => {
	try {
		const st = await fs.stat(file, {bigint: true});
		return `${st.mtimeNs}:${st.size}`;
	} catch {
		return "-";
	}
};

const createModuleLoader = (modulesDir, configPath) => {
	let cachedStamp = null;
	let cachedModules = null;

	return async () => {
		const ids = (await fs.readdir(modulesDir)).sort();
		const [configSig, ...manifestSigs] = await Promise.all([
			statSig(configPath),
			...ids.map(id => statSig(path.join(modulesDir, id, "module.json"))),
		]);
		const stamp = `${configSig}|${ids.map((id, i) => `${id}=${manifestSigs[i]}`).join("|")}`;
		if (cachedStamp === stamp && cachedModules) return cachedModules;

		const [config, defs] = await Promise.all([
			readJson(configPath).catch(() => ({})),
			Promise.all(ids.map((id, i) =>
				manifestSigs[i] === "-"
					? null
					: readJson(path.join(modulesDir, id, "module.json")).catch(() => null),
			)),
		]);
		const saved = config?.deploy?.modules ?? {};
		const modules = [];
		for (let i = 0; i < ids.length; i++) {
			const def = defs[i];
			if (!def) continue;
			const id = ids[i];
			modules.push({id, dir: path.join(modulesDir, id), def, ...moduleValues(def, saved[id])});
		}
		const skip = new Set(modules.filter(m => m.def.replaces?.length).flatMap(m => [m.id, ...m.def.replaces]));
		cachedModules = modules
			.filter(m => m.enabled && !skip.has(m.id))
			.sort((a, b) => (a.def.order ?? 0) - (b.def.order ?? 0) || a.id.localeCompare(b.id));
		cachedStamp = stamp;
		return cachedModules;
	};
};

export const createOverlay = ({siteRoot, modulesDir, configPath, dataDir, managerDir}) => {
	// The latest warnings per file, so fixing an anchor clears its warning on the next load.
	const byFile = new Map();
	const loadModules = createModuleLoader(modulesDir, configPath);

	const serve = async rel => {
		rel = rel.split(path.sep).join("/");
		const modules = await loadModules();
		const warnings = [];
		let body = null;
		let touched = false;

		for (const module of modules) {
			for (const entry of module.def.entries ?? []) {
				if (entry.disabled || !optionAllows(entry, module.values) || !entry.target) continue;
				const target = entry.target.replace(/^\.\/?/, "");
				if (entry.type === "copy") {
					const under = target === "" || rel === target || rel.startsWith(`${target}/`);
					if (!under) continue;
					const source = resolveModuleSource(entry.source ?? "", {
						moduleDir: module.dir,
						dataDir,
						managerDir,
						values: module.values,
					});
					const file = source && (rel === target ? source : path.join(source, rel.slice(target ? target.length + 1 : 0)));
					if (file && await exists(file) && (await fs.stat(file)).isFile()) {
						body = await fs.readFile(file);
						touched = true;
					} else if (!entry.ifExists && rel === target) {
						warnings.push(`${module.def.title}: nothing to copy to ${rel} (${entry.source} not found)`);
					}
				} else if (entry.type === "patch" && rel === target) {
					const text = body !== null ? String(body) : await fs.readFile(path.join(siteRoot, rel), "utf8").catch(() => null);
					if (text === null) {
						warnings.push(`${module.def.title}: ${rel} not found`);
						continue;
					}
					// The engine reads insertFile blocks through a synchronous callback.
					const readInsert = name => readFileSync(path.join(module.dir, name), "utf8");
					const out = applyPatches(text, rel, entry.patches ?? [], module.values, readInsert);
					for (const d of out.details) if (d.startsWith("Required patch failed")) warnings.push(`${module.def.title}: ${d}`);
					body = out.text;
					touched = true;
				}
			}
		}

		if (rel === "css/main.css") {
			const blocks = [];
			for (const module of modules.filter(m => m.def.css)) {
				const css = await fs.readFile(path.join(module.dir, module.def.css), "utf8");
				blocks.push(`/* ${module.def.title} */\n${css.trimEnd()}`);
			}
			if (blocks.length) {
				const main = body !== null ? String(body) : await fs.readFile(path.join(siteRoot, rel), "utf8");
				const stripped = main.includes(CSS_MARKER) ? main.slice(0, main.indexOf(CSS_MARKER)).trimEnd() : main.trimEnd();
				body = `${stripped}\n\n${CSS_MARKER}\n${blocks.join("\n\n")}\n`;
				touched = true;
			}
		}

		if (warnings.length) byFile.set(rel, warnings);
		else byFile.delete(rel);
		return touched ? {body, warnings} : null;
	};

	return {serve, warnings: () => [...byFile.values()].flat()};
};
