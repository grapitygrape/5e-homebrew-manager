// node --test shell/omni-complete.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {aliasItems, applyCompletion, findToken, keepAccepted, rankCompletions, searchText} from "./omni-complete.js";

const data = {
	in: [
		{insert: "sp", label: "sp", detail: "spell", keys: ["sp"], words: "spell"},
		{insert: "spell", label: "spell", detail: "1,500", keys: ["spell"], words: "spell"},
		{insert: "class feature", label: "class feature", detail: "900", keys: ["class feature"], words: "class feature"},
		{insert: "subclass feature", label: "subclass feature", detail: "2,000", keys: ["subclass feature"], words: "subclass feature"},
		{insert: "item", label: "item", detail: "2,400", keys: ["item"], words: "item"},
	],
	source: [
		{insert: "PHB", label: "PHB", detail: "Player's Handbook (2014)", keys: ["phb"], words: "player's handbook (2014)"},
		{insert: "XPHB", label: "XPHB", detail: "Player's Handbook (2024)", keys: ["xphb"], words: "player's handbook (2024)"},
		{insert: "MM", label: "MM", detail: "Monster Manual (2014)", keys: ["mm"], words: "monster manual (2014)"},
	],
};

test("no token without a key and colon", () => {
	assert.equal(findToken("fireball", 8), null);
	assert.equal(findToken("in", 2), null);
	assert.equal(findToken("page:12", 7), null);
});

test("finds the token at the caret, not one earlier in the query", () => {
	const text = "in:spell fire source:ph";
	assert.deepEqual(findToken(text, text.length), {key: "source", start: 14, valueStart: 21, value: "ph"});
	assert.deepEqual(findToken(text, 5), {key: "in", start: 0, valueStart: 3, value: "sp"});
});

test("the value skips spaces and a negating !", () => {
	assert.deepEqual(findToken("in: !sp", 7), {key: "in", start: 0, valueStart: 5, value: "sp"});
});

test("a key glued to a word isn't a token", () => {
	assert.equal(findToken("bin:sp", 6), null);
});

test("prefix matches come first, then matches inside a name", () => {
	const sub = rankCompletions(findToken("in:fea", 6), data).map(it => it.insert);
	assert.deepEqual(sub, ["class feature", "subclass feature"]);
	const sp = rankCompletions(findToken("in:sp", 5), data).map(it => it.insert);
	assert.deepEqual(sp, ["sp", "spell"]);
});

test("in: values can contain spaces", () => {
	const got = rankCompletions(findToken("in:class f", 10), data).map(it => it.insert);
	assert.deepEqual(got, ["class feature", "subclass feature"]);
});

test("sources match the abbreviation first, then the full name", () => {
	assert.deepEqual(rankCompletions(findToken("source:phb", 10), data).map(it => it.insert), ["PHB", "XPHB"]);
	assert.deepEqual(rankCompletions(findToken("source:monster", 14), data).map(it => it.insert), ["MM"]);
});

test("an empty value lists everything for that key", () => {
	assert.equal(rankCompletions(findToken("in:", 3), data).length, data.in.length);
});

test("nothing to suggest once the value is exactly the only match", () => {
	assert.deepEqual(rankCompletions(findToken("in:item", 7), data), []);
});

test("accepting replaces the value and adds a space", () => {
	const text = "in:sp fire";
	const token = findToken(text, 5);
	assert.deepEqual(applyCompletion(text, 5, token, data.in[1]), {text: "in:spell fire", caret: 9});
	assert.deepEqual(applyCompletion("in:sp", 5, findToken("in:sp", 5), data.in[1]), {text: "in:spell ", caret: 9});
});

test("accepting keeps a negating !", () => {
	assert.deepEqual(applyCompletion("in:!sp", 6, findToken("in:!sp", 6), data.in[1]), {text: "in:!spell ", caret: 10});
});

test("an accepted source moves to the end, since source: takes everything after it", () => {
	const text = "source:ph fireball";
	assert.deepEqual(applyCompletion(text, 9, findToken(text, 9), data.source[0]), {text: "fireball source:PHB", caret: 19});
});

test("a token still being completed is left out of the search", () => {
	assert.equal(searchText("in:", 3, data), "");
	assert.equal(searchText("fire in:sp", 10, data), "fire");
	assert.equal(searchText("in:class f fire", 10, data), "fire");
	assert.equal(searchText("fireball source:", 16, data), "fireball");
});

test("a finished token and plain text are searched as typed", () => {
	assert.equal(searchText("in:spell fire", 13, data), "in:spell fire");
	assert.equal(searchText("in:item", 7, data), "in:item");
	assert.equal(searchText("fireball", 8, data), "fireball");
	assert.equal(searchText("in:sp", 5, null), "in:sp");
});

test("only suggests in: values the site's own pattern reads whole", () => {
	// Built like upstream's: one alternation in index order, so "class" wins over "class feature".
	const re = /\bin:\s*(?<isNegate>!)?(?<category>class|class feature|classfeature|spell)s?\b/gi;
	const items = ["class", "class feature", "classfeature", "spell"].map(insert => ({insert}));
	assert.deepEqual(keepAccepted(items, re).map(it => it.insert), ["class", "classfeature", "spell"]);
	assert.equal(keepAccepted(items, null).length, 4);
});

test("aliases show what they stand for and the total count", () => {
	const counts = {"Class Feature": 900, "Metamagic": 20, "Maneuver": 30};
	const [cf, opf] = aliasItems({cf: ["Class Feature"], opf: ["Metamagic", "Maneuver"]}, counts);
	assert.equal(cf.label, "cf");
	assert.equal(cf.note, "class feature");
	assert.equal(cf.detail, "900");
	assert.equal(opf.note, "metamagic, maneuver");
	assert.equal(opf.detail, "50");
});

test("an alias for categories with nothing in the index isn't offered", () => {
	assert.deepEqual(aliasItems({ptn: ["Crochet Pattern"]}, {"Spell": 5}), []);
});

test("a category an alias lists twice counts once", () => {
	const [opf] = aliasItems({opf: ["Rune Knight Rune", "Metamagic", "Rune Knight Rune"]}, {"Rune Knight Rune": 6, "Metamagic": 20});
	assert.equal(opf.note, "rune knight rune, metamagic");
	assert.equal(opf.detail, "26");
});
