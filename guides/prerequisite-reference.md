# Prerequisite Reference `prerequisite`

`prerequisite` is one shared schema definition (`util.json#/$defs/prerequisite`)
used by every entity that can gate itself behind requirements — **feats**,
**optional features**, **backgrounds**, and the class/subclass feature types. The
key set is identical everywhere; only which keys make sense differs. This page is
the single description of that key set, so the per-entity guides can link here
instead of each carrying a partial copy.

---

## How the logic works

`prerequisite` is an **array of objects**.

- **Between objects — OR.** Meeting any one object satisfies the prerequisite.
- **Within an object — AND.** Every key present must be satisfied.

```json
"prerequisite": [{ "level": 4, "ability": [{ "str": 13 }] }, { "feat": ["grappler|phb"] }]
```

Reads as: _(4th level **and** Strength 13) **or** the Grappler feat._

Omit the property entirely when there are no requirements — do not write an empty
array.

---

## Display keys

Most keys generate the prerequisite line automatically. Three exist to control
what the reader actually sees.

<table>
  <thead><tr><th>Key</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>other</code></td><td>string</td><td>Free text used verbatim as the prerequisite line, for requirements the schema cannot express.</td></tr>
    <tr><td><code>otherSummary</code></td><td>object</td><td>A long form and a short form: <code>entry</code> is the full text, <code>entrySummary</code> the abbreviated version shown in cramped contexts such as list views. Use this instead of <code>other</code> when the full wording is too long for a table row.</td></tr>
    <tr><td><code>note</code></td><td>string</td><td>An extra clarifying note appended after the generated line. Does not itself impose a requirement.</td></tr>
  </tbody>
</table>

```json
"prerequisite": [
  {
    "otherSummary": {
      "entry": "Must have survived a night in the Ashen Reach",
      "entrySummary": "Survived the Ashen Reach"
    }
  }
]
```

---

## Character keys

<table>
  <thead><tr><th>Key</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>level</code></td><td>integer | object</td><td>A bare integer is a character level. The object form is <code>level</code> (integer, required) plus optional <code>class</code> and <code>subclass</code> objects — see <strong>Class and subclass gating</strong> below.</td></tr>
    <tr><td><code>ability</code></td><td>array</td><td>Objects of score minimums keyed <code>str</code>, <code>dex</code>, <code>con</code>, <code>int</code>, <code>wis</code>, <code>cha</code>, e.g. <code>[{ "str": 13, "cha": 13 }]</code>.</td></tr>
    <tr><td><code>race</code></td><td>array</td><td>Objects with <code>name</code> (required), plus <code>subrace</code> to narrow to one subrace and <code>displayEntry</code> to override the rendered text (useful when the species name alone reads badly).</td></tr>
    <tr><td><code>background</code></td><td>array</td><td>Objects with <code>name</code> (required) and optional <code>displayEntry</code>.</td></tr>
    <tr><td><code>alignment</code></td><td>array</td><td>Alignment codes: <code>"L"</code> Lawful · <code>"N"</code> Neutral · <code>"NX"</code> Neutral (law/chaos axis) · <code>"NY"</code> Neutral (good/evil axis) · <code>"C"</code> Chaotic · <code>"G"</code> Good · <code>"E"</code> Evil · <code>"U"</code> Unaligned · <code>"A"</code> Any.</td></tr>
    <tr><td><code>group</code></td><td>array</td><td>Class-group strings, e.g. <code>"expert"</code>, <code>"mage"</code>, <code>"priest"</code>, <code>"warrior"</code>.</td></tr>
    <tr><td><code>culture</code></td><td>array</td><td>Culture names, e.g. <code>"Elven"</code>.</td></tr>
    <tr><td><code>campaign</code></td><td>array</td><td>Campaign-setting names, e.g. <code>"Dragonlance"</code>, <code>"Planescape"</code>, <code>"Eberron"</code>, <code>"Ravenloft"</code>.</td></tr>
    <tr><td><code>membership</code></td><td>array</td><td>Faction names, e.g. <code>"Harpers"</code>, <code>"Zhentarim"</code>, <code>"Emerald Enclave"</code>.</td></tr>
  </tbody>
</table>

### Class and subclass gating

The object form of `level` carries `class` and/or `subclass`, each an object with
`name` (required) and `source`, plus three visibility flags — all `true`-only:

<table>
  <thead><tr><th>Flag</th><th>Effect</th></tr></thead>
  <tbody>
    <tr><td><code>visibleList</code></td><td>Show the class name in the list display.</td></tr>
    <tr><td><code>visibleStats</code></td><td>Show the class name in the prerequisite line.</td></tr>
    <tr><td><code>visible</code></td><td>Both of the above at once.</td></tr>
  </tbody>
</table>

Leave the flags off for features that already imply their class — an Eldritch
Invocation does not need "Warlock" repeated in its own prerequisite line. Set
them when the entity can appear outside that context and the class would
otherwise be invisible.

```json
"prerequisite": [
  {
    "level": {
      "level": 5,
      "class": { "name": "Warlock", "source": "PHB" },
      "subclass": { "name": "The Fiend", "source": "PHB", "visible": true }
    }
  }
]
```

Both `class` and `subclass` are closed objects — no keys beyond the four above.

---

## Content keys

<table>
  <thead><tr><th>Key</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>feat</code></td><td>array</td><td>Feat UIDs, e.g. <code>"grappler|phb"</code>. No duplicates.</td></tr>
    <tr><td><code>featCategory</code></td><td>array</td><td>Requires a feat from a category. Each element is either a category code, or an object with <code>category</code> (array of codes) and <code>count</code> (how many such feats are needed).</td></tr>
    <tr><td><code>exclusiveFeatCategory</code></td><td>array</td><td>Category codes the character must <em>not</em> already have a feat from — the mechanism behind "you can only ever take one Origin feat" style restrictions.</td></tr>
    <tr><td><code>optionalfeature</code></td><td>array</td><td>Optional-feature UIDs (invocations, maneuvers, metamagic, …).</td></tr>
    <tr><td><code>feature</code></td><td>array</td><td>Class- or subclass-feature UIDs.</td></tr>
    <tr><td><code>item</code></td><td>array</td><td>Item UIDs the character must have.</td></tr>
    <tr><td><code>itemType</code></td><td>array</td><td>Item type codes — the same codes used by an item's own <code>type</code>.</td></tr>
    <tr><td><code>itemProperty</code></td><td>array | null</td><td>Item property codes. Explicit <code>null</code> means "no property", used to require a plain, unmodified item.</td></tr>
  </tbody>
</table>

Feat category codes are the same set `feat` uses for its own `category`:
`"D"` Dragonmark · `"DG"` Dark Gift · `"G"` General · `"O"` Origin ·
`"FS"` Fighting Style · `"FS:P"` Fighting Style (Paladin) ·
`"FS:R"` Fighting Style (Ranger) · `"EB"` Epic Boon. Register any custom code in
`_meta.featCategories` — see [meta.md](meta.md).

```json
"prerequisite": [
  { "featCategory": [{ "category": ["FS"], "count": 2 }] },
  { "exclusiveFeatCategory": ["O"] }
]
```

---

## Proficiency keys

<table>
  <thead><tr><th>Key</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>proficiency</code></td><td>array</td><td>Objects with any of <code>armor</code> (<code>"light"</code> / <code>"medium"</code> / <code>"heavy"</code> / <code>"shield"</code>), <code>weapon</code> (<code>"simple"</code> / <code>"martial"</code> — proficiency with <em>any</em> such weapon), <code>weaponGroup</code> (same values — proficiency with <em>all</em> of them), <code>skill</code>, and <code>tool</code> (<code>true</code> for any tool, or an array of lowercase tool names such as <code>["thieves' tools"]</code>).</td></tr>
    <tr><td><code>expertise</code></td><td>array</td><td>Objects with <code>skill</code>, requiring expertise rather than plain proficiency.</td></tr>
  </tbody>
</table>

`skill` is either `true` (any skill proficiency at all) or an array of lowercase
skill names — the same names used elsewhere in the schema, so a homebrew skill
takes its UID form (`"gaming set|MySource"`).

The `weapon` / `weaponGroup` distinction is easy to get backwards: `weapon` means
_any one_ simple/martial weapon, `weaponGroup` means _the whole group_.

```json
"prerequisite": [{ "proficiency": [{ "armor": "heavy", "skill": ["athletics"] }] }]
```

Both objects are closed — a misspelled key is a validation error, not a silently
ignored field.

---

## Spellcasting keys

<table>
  <thead><tr><th>Key</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>spellcasting</code></td><td>true</td><td>The classic "ability to cast at least one spell" requirement.</td></tr>
    <tr><td><code>spellcasting2020</code></td><td>true</td><td>The 2020-onward revision of the same requirement, which counts a wider set of features. Prefer this for new content built on modern rules.</td></tr>
    <tr><td><code>spellcastingFeature</code></td><td>true</td><td>Requires the Spellcasting feature specifically, rather than any means of casting.</td></tr>
    <tr><td><code>spellcastingPrepared</code></td><td>true</td><td>Requires a <em>prepared</em> caster — excludes known-spell casters such as the Sorcerer.</td></tr>
    <tr><td><code>spellcastingFocus</code></td><td>true | array</td><td><code>true</code> for any spellcasting focus; an array narrows it, e.g. <code>["arcane", "druid", "holy", "tool", "artisansTool"]</code>.</td></tr>
    <tr><td><code>psionics</code></td><td>true</td><td>Requires psionic ability.</td></tr>
    <tr><td><code>spell</code></td><td>array</td><td>Required spells. Each element is a spell UID string, or an object with <code>choose</code> (a filter expression instead of a fixed spell), <code>entry</code> (override text), and <code>entrySummary</code> (short form for list views).</td></tr>
    <tr><td><code>pact</code></td><td>string</td><td>Warlock Pact Boon, e.g. <code>"Chain"</code>, <code>"Blade"</code>, <code>"Tome"</code>.</td></tr>
    <tr><td><code>patron</code></td><td>string</td><td>Warlock patron, e.g. <code>"The Fiend"</code>.</td></tr>
  </tbody>
</table>

These are `true`-only flags: write `"psionics": true`, never `false`. To express
the absence of a requirement, leave the key out.

```json
"prerequisite": [
  {
    "spellcasting2020": true,
    "spell": [{ "choose": "level=1|class=Warlock", "entrySummary": "a 1st-level warlock spell" }]
  }
]
```

---

## Common mistakes

- **Using `false`.** Every flag key is `const: true`. `"spellcasting": false` fails validation.
- **One object when you meant two.** Keys in the same object are ANDed. Alternatives belong in separate objects.
- **An empty array.** Omit `prerequisite` rather than writing `[]`.
- **`other` for something the schema models.** Free text does not filter or sort; a modelled key does. Reach for `other` only when nothing fits.
- **Adding keys.** The prerequisite object and its `class`, `subclass`, `proficiency`, and `expertise` sub-objects are all closed.
