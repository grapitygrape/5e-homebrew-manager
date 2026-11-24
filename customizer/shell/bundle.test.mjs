// node --test shell/bundle.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {bundleShellCss} from "./bundle.mjs";

const css = await bundleShellCss();

test("no imports are left for the browser to fetch", () => {
	assert.doesNotMatch(css, /@import/);
});

test("the theme keeps its own layer", () => {
	assert.match(css, /@layer shell-theme \{/);
});

test("font paths still resolve from css/", () => {
	assert.ok(css.includes(`url("../fonts/majesty-bold.woff2")`));
	assert.ok(css.includes(`url("../watercolor-light.webp")`));
});

test("files keep shell.css's order", () => {
	const tokens = css.indexOf("--shell-color-page:");
	assert.ok(tokens !== -1 && tokens < css.indexOf(".shell-tooltip {"), "tokens before tooltips");
});

test("comments are stripped", () => {
	assert.doesNotMatch(css, /\/\*/);
});
