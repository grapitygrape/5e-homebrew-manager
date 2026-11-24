// Static server for the rework. Serves the site (scripts/paths.mjs). Images and
// homebrew are read from the manager's Tools source folder so the site doesn't need
// 50 GB of them, and nothing here can write to it. Fonts and textures come from
// their sources in paths.mjs.
// Files the manager's deploy modules change are served changed (modules-overlay.mjs).
import {createReadStream, promises as fs} from "node:fs";
import http from "node:http";
import path from "node:path";
import {assetFile, dataDir, IMAGE_DIRS, imageRoot, managerConfigPath, managerRoot, repoRoot, siteRoot} from "../scripts/paths.mjs";
import {bundleShellCss} from "./bundle.mjs";
import {createOverlay} from "./modules-overlay.mjs";

const root = siteRoot();
const imageDirs = new Set(IMAGE_DIRS);
const port = Number(process.env.PORT || 5175);

const overlay = createOverlay({
	siteRoot: root,
	modulesDir: path.join(managerRoot, "deploy-modules"),
	configPath: managerConfigPath(),
	dataDir,
	managerDir: managerRoot,
});

const contentTypes = {
	".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
	".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff": "font/woff", ".woff2": "font/woff2",
	".ttf": "font/ttf", ".webmanifest": "application/manifest+json", ".xml": "application/xml",
	".mp3": "audio/mpeg",
};

// Shows module anchors the shell broke, after the page's own scripts have loaded.
const BANNER = `<script>
window.addEventListener("load", async () => {
	const warnings = await (await fetch("/__module-warnings")).json();
	if (!warnings.length) return;
	const box = document.createElement("div");
	box.style.cssText = "position:fixed;inset-block-end:0;inset-inline:0;z-index:99999;padding:0.5em 1em;background:#7a1c1c;color:#fff;font:13px/1.4 monospace";
	box.innerText = "Deploy module anchors that no longer match:\\n" + warnings.join("\\n");
	box.onclick = () => box.remove();
	document.body.append(box);
});
</script>`;

const logged = new Set();
const report = warnings => warnings.filter(w => !logged.has(w)).forEach(w => {
	logged.add(w);
	console.warn(`module: ${w}`);
});

const resolve = async urlPath => {
	const rel = path.normalize(decodeURIComponent(urlPath)).replace(/^[/\\]+/, "");
	if (rel.startsWith("..")) return null;
	const posix = rel.split(path.sep).join("/");
	let file = assetFile(posix) ?? path.join(imageDirs.has(posix.split("/")[0]) ? imageRoot : root, rel);
	const stat = await fs.stat(file).catch(() => null);
	if (stat?.isDirectory()) file = path.join(file, "index.html");
	else if (!stat) return null;
	return file;
};

const send = (res, ext, body) => {
	if (ext === ".html") body = String(body).replace("</body>", `${BANNER}</body>`);
	res.writeHead(200, {"Content-Type": contentTypes[ext] || "application/octet-stream", "Cache-Control": "no-store"}).end(body);
};

http.createServer(async (req, res) => {
	const urlPath = new URL(req.url, "http://localhost").pathname;
	// A caching service worker would serve stale CSS during the rework. Answer with one
	// that does nothing, because a 404 makes the page's registration throw.
	if (urlPath.endsWith("/sw.js")) {
		res.writeHead(200, {"Content-Type": "text/javascript", "Cache-Control": "no-store"}).end("self.addEventListener(\"install\", () => self.skipWaiting());");
		return;
	}
	if (urlPath === "/__module-warnings") {
		res.writeHead(200, {"Content-Type": "application/json", "Cache-Control": "no-store"}).end(JSON.stringify(overlay.warnings()));
		return;
	}
	// The shell's deployed files, built from shell/ on each request so a reload shows an edit.
	if (urlPath === "/css/shell.css") {
		res.writeHead(200, {"Content-Type": "text/css", "Cache-Control": "no-store"}).end(await bundleShellCss());
		return;
	}
	const shellScript = {"/js/shell-tooltips.js": "tooltips.js", "/js/shell-omni-complete.js": "omni-complete.js"}[urlPath];
	if (shellScript) {
		res.writeHead(200, {"Content-Type": "text/javascript", "Cache-Control": "no-store"});
		createReadStream(path.join(repoRoot, "shell", shellScript)).pipe(res);
		return;
	}

	const rel = decodeURIComponent(urlPath).replace(/^\/+/, "").replace(/(^|\/)$/, "$1index.html");
	const patched = rel.startsWith("..") ? null : await overlay.serve(rel).catch(e => {
		report([`${rel}: ${e.message}`]);
		return null;
	});
	if (patched) {
		report(patched.warnings);
		send(res, path.extname(rel).toLowerCase(), patched.body);
		return;
	}

	const file = await resolve(urlPath);
	if (!file) { res.writeHead(404).end("Not found"); return; }
	const ext = path.extname(file).toLowerCase();
	if (ext === ".html") { send(res, ext, await fs.readFile(file, "utf8")); return; }
	res.writeHead(200, {"Content-Type": contentTypes[ext] || "application/octet-stream", "Cache-Control": "no-store"});
	createReadStream(file).on("error", () => res.destroy()).pipe(res);
}).listen(port, () => console.log(`${path.basename(root)}: http://localhost:${port}/`));
