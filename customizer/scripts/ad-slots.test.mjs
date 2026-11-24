// node --test scripts/
import assert from "node:assert/strict";
import test from "node:test";
import {adSlotsInHtml, adSlotsInPatch} from "./ad-slots.mjs";

const PATCH = `diff --git a/js/a.js b/js/a.js
--- a/js/a.js
+++ b/js/a.js
@@ -1,3 +1,3 @@
 const kept = "data-cancer-id";
-<div data-cancer-id="cancer-wrapper">
+<div data-cancer-id="cancer-wrapper" class="ours">
+<div class="clean">
diff --git a/node/t.hbs b/node/t.hbs
--- a/node/t.hbs
+++ b/node/t.hbs
@@ -1 +1 @@
-<div class="cancer__anchor"></div>
+<!--5ETOOLS_AD_LEFT_1-->
`;

test("added lines that mention cancer or an ad slot are reported with their file", () => {
	assert.deepEqual(adSlotsInPatch(PATCH), [
		{file: "js/a.js", text: "<div data-cancer-id=\"cancer-wrapper\" class=\"ours\">"},
		{file: "node/t.hbs", text: "<!--5ETOOLS_AD_LEFT_1-->"},
	]);
});

test("removed and context lines don't count", () => {
	assert.deepEqual(adSlotsInPatch(PATCH.replace(/^\+.*(cancer|5ETOOLS_AD).*$/gim, "+ok")), []);
});

test("a page's ad elements, hooks and comments are all found", () => {
	const html = `<main class="container" data-cancer-id="cancer-wrapper">
<div class="cancer__wrp-leaderboard"><!--5ETOOLS_AD_LEADERBOARD--></div>
<p>A cancerous growth</p>`;
	assert.equal(adSlotsInHtml(html).length, 3);
});

test("the ad network's consent box, scripts and slot ids are found too", () => {
	const html = `<div id=consent-box><button onclick='window.__cmp("showModal")'>Update Cookie Preferences</button></div>
<script>if (window["nitroAds"]) {}</script><span data-ccpa-link="1"></span>`;
	assert.deepEqual(adSlotsInHtml(html), ["consent-box", "__cmp", "nitroAds", "data-ccpa-link"]);
	assert.deepEqual(adSlotsInPatch("diff --git a/scss/i.scss b/scss/i.scss\n+[id=\"div-gpt-ad-5etools35927\"]::after,\n+window.__cmp2 = () => {};\n").map(h => h.text),
		["[id=\"div-gpt-ad-5etools35927\"]::after,", "window.__cmp2 = () => {};"]);
});

test("the hosting pipeline's script anchor is found", () => {
	assert.deepEqual(adSlotsInHtml("<!--5ETOOLS_SCRIPT_ANCHOR-->"), ["5ETOOLS_SCRIPT_ANCHOR"]);
	assert.equal(adSlotsInPatch("diff --git a/a.hbs b/a.hbs\n+<!--5ETOOLS_SCRIPT_ANCHOR-->\n").length, 1);
});

test("the privacy policy's own wording about advertising isn't flagged", () => {
	assert.deepEqual(adSlotsInHtml("<p>we use third-party advertising companies to place customized advertisements</p>"), []);
});

test("lore text in a page isn't flagged", () => {
	assert.deepEqual(adSlotsInHtml("<p>A cancer possessed by the mind of a dead mage</p>"), []);
});
