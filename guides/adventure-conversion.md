# Adventures `adventure`

The `adventure` array holds the **metadata + table of contents** for a homebrew adventure (a module or campaign, as opposed to a sourcebook). It is the index entry that makes the adventure appear in the navbar and Search. The actual page content lives in a separate `adventureData` array — the adventure counterpart of `bookData`, see [bookData conversion](bookdata-conversion.md) for the shared page-content format.

```json
{
  "$schema": "https://raw.githubusercontent.com/TheGiddyLimit/5etools-utils/master/schema/brew-fast/homebrew.json",
  "_meta": {
    "sources": [{ "json": "YourSourceId", ... }],
    "edition": "classic",
    "dateAdded": 0,
    "dateLastModified": 0,
    ...
  },
  "adventure": [ ... ],
  "adventureData": [ ... ]
}
```

An adventure is split across the two arrays: every `adventure` entry should have a matching `adventureData` entry whose `id` and `source` are identical. The structure closely parallels [book conversion](book-conversion.md) — the differences are that adventures additionally require `level` and `storyline`, and offer Adventurers League metadata.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The adventure's display title, e.g. <code>"Dungeons of Drakkenheim"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>id</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Short identifier used to reference this adventure in tags (e.g. <code>{@adventure ...}</code>) and to link to the matching <code>adventureData</code> entry. By convention it matches the <code>source</code>. Must satisfy the source-string pattern (1–2 chars, or 3+ chars that start and end with an alphanumeric).
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>group</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Navbar category the adventure is listed under. One of: <code>"supplement"</code>, <code>"supplement-alt"</code>, <code>"prerelease"</code>, <code>"homebrew"</code>, <code>"organized-play"</code>, <code>"other"</code>. Most homebrew uses <code>"homebrew"</code>. (Note this is a <em>shorter</em> list than the <code>book</code> group enum — there is no <code>"core"</code>, <code>"setting"</code>, <code>"screen"</code>, <code>"recipe"</code>, or <code>"homecraft"</code>.)
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>published</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Publication date in <code>YYYY-MM-DD</code> (RFC 3339) format, e.g. <code>"2026-01-28"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>storyline</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The story arc / product line the adventure belongs to. See <a href="#storyline">Storyline values</a> below.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>level</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      The character levels the adventure spans. Exactly one of two closed forms:
      <pre><code class="language-json">"level": { "start": 1, "end": 5 }</code></pre>
      <pre><code class="language-json">"level": { "custom": "Any" }</code></pre>
      <code>start</code>/<code>end</code> must be given together; <code>custom</code> is used alone when the range is not a simple pair.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>contents</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      The linked table of contents (at least one entry). Identical in shape to a book's <code>contents</code>: each item is an object with <code>name</code> (required, must match the corresponding top-level entry in <code>adventureData.data</code>), optional <code>headers</code>, and optional <code>ordinal</code>.
      <ul>
        <li><code>headers</code> <span class="prop-type">array</span> — each item is a plain string, or an object with <code>header</code> (required) plus any of <code>depth</code>, <code>index</code>, <code>source</code>, <code>statblock</code>, <code>tag</code>, <code>uid</code>. <code>source</code> requires <code>statblock</code>; <code>tag</code> and <code>uid</code> require each other <em>and</em> <code>statblock</code>. See <a href="book-conversion.md">book conversion</a> for the full explanation and examples.</li>
        <li><code>ordinal</code> <span class="prop-type">object</span> — <code>{ "type": string, "identifier": integer | string }</code>. <code>type</code> (required) is one of <code>"chapter"</code>, <code>"appendix"</code>, <code>"part"</code>, <code>"episode"</code>, <code>"level"</code>, <code>"section"</code>. Front/back matter omits <code>ordinal</code>.</li>
      </ul>
    </div>
  </div>
</div>

### Optional

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>author</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Author credit displayed for the adventure.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>cover</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Cover image (preferred 300×300 or 600×600). One of two forms:
      <pre><code class="language-json">"cover": { "type": "internal", "path": "covers/MyAdv.webp" }</code></pre>
      <pre><code class="language-json">"cover": { "type": "external", "url": "https://example.com/cover.webp" }</code></pre>
      Internal <code>path</code> must end in <code>.webp</code>, <code>.mp3</code>, or <code>.opus</code>. External <code>url</code> must start with <code>http(s)://</code> and must only point to the source content.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>coverCredit</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Attribution for the cover image, shown alongside it. Free text — name the artist and, where relevant, the licence.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>revised</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Date of a later revision, same <code>YYYY-MM-DD</code> format as <code>published</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>publishedOrder</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Sorting order for adventures that share a single source — e.g. several short modules bundled in one book.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>parentSource</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">A source identifier used for sources containing multiple adventures (e.g. an anthology) or "packages" of related products.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alias</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Alternate names (strings) the adventure can be found under in Search.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alAveragePlayerLevel</code> / <code>alLength</code> / <code>alId</code>
      <span class="prop-type">homebrew only</span>
    </div>
    <div class="prop-card-val">
      Adventurers League metadata, accepted only in homebrew. <code>alAveragePlayerLevel</code> <span class="prop-type">integer</span>; <code>alLength</code> <span class="prop-type">object</span> in hours, either <code>{ "min": n, "max": n }</code> or <code>{ "exact": n }</code>; <code>alId</code> <span class="prop-type">string</span>.
      <pre><code class="language-json">"alAveragePlayerLevel": 5,
"alLength": { "exact": 4 },
"alId": "DDAL-MYB-01"</code></pre>
    </div>
  </div>
</div>

> There is **no `legacy` property** on an adventure — that key exists on `book` but not here. The adventure object is closed (`additionalProperties: false`), so adding it is a validation error.

---

<h2 id="storyline">Storyline values</h2>

`storyline` is required. On the site it is a closed enum; in homebrew the same list is treated as **examples**, so a custom storyline validates — but reuse an official value when the adventure genuinely belongs to that line, so it groups correctly in the UI.

Official <code>storyline</code> values: <span class="schema-enum" data-enum="storylines"><code>"Starter Set"</code>, <code>"Tyranny of Dragons"</code>, <code>"Elemental Evil"</code>, <code>"Rage of Demons"</code>, <code>"Ravenloft"</code>, <code>"Storm King's Thunder"</code>, <code>"Tales from the Yawning Portal"</code>, <code>"Tomb of Annihilation"</code>, <code>"Waterdeep"</code>, <code>"Ravnica"</code>, <code>"Extra Life"</code>, <code>"Ghosts of Saltmarsh"</code>, <code>"Acquisitions Incorporated"</code>, <code>"Essentials Kit"</code>, <code>"Stranger Things"</code>, <code>"Baldur's Gate"</code>, <code>"Eberron"</code>, <code>"Rick and Morty"</code>, <code>"Wildemount"</code>, <code>"Icewind Dale"</code>, <code>"Mythic Odysseys of Theros"</code>, <code>"Candlekeep Mysteries"</code>, <code>"Adventures in the Forgotten Realms"</code>, <code>"The Wild Beyond the Witchlight"</code>, <code>"Ixalan"</code>, <code>"NERDS Restoring Harmony"</code>, <code>"Strixhaven"</code>, <code>"Critical Role"</code>, <code>"Journeys through the Radiant Citadel"</code>, <code>"Spelljammer"</code>, <code>"Dragonlance"</code>, <code>"Keys from the Golden Vault"</code>, <code>"Giants of the Star Forge"</code>, <code>"Minecraft"</code>, <code>"Planescape"</code>, <code>"Adventure Atlas"</code>, <code>"Heroes' Feast"</code>, <code>"Family Friendly"</code>, <code>"Vecna"</code>, <code>"Quests from the Infinite Staircase"</code>, <code>"LEGO"</code>, <code>"Shadow Realm"</code>, <code>"Animated Series"</code>, <code>"Dragon Delves"</code>, <code>"Forgotten Realms"</code>, <code>"International Day of Play"</code>, <code>"Thay"</code>, <code>"World of Warcraft"</code>, <code>"Miscellaneous"</code></span>.

Standalone homebrew with no product line usually takes `"Miscellaneous"`, or its own custom string.

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Adventure title (required).</td></tr>
    <tr><td><code>id</code></td><td>string</td><td>Tag/corpus/adventure/book ID, conventionally equal to <code>source</code> (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>group</code></td><td>string</td><td>Navbar category (required) — <code>"supplement"</code>, <code>"supplement-alt"</code>, <code>"prerelease"</code>, <code>"homebrew"</code>, <code>"organized-play"</code>, <code>"other"</code>.</td></tr>
    <tr><td><code>published</code></td><td>string</td><td><code>YYYY-MM-DD</code> publication date (required).</td></tr>
    <tr><td><code>storyline</code></td><td>string</td><td>Story arc / product line (required). See the table above.</td></tr>
    <tr><td><code>level</code></td><td>object</td><td>Level span (required) — <code>{start, end}</code> or <code>{custom}</code>, closed.</td></tr>
    <tr><td><code>contents</code></td><td>array</td><td>Linked table of contents (required, at least one entry).</td></tr>
    <tr><td><code>author</code></td><td>string</td><td>Author credit.</td></tr>
    <tr><td><code>cover</code></td><td>object</td><td>Cover image — internal <code>path</code> or external <code>url</code>.</td></tr>
    <tr><td><code>coverCredit</code></td><td>string</td><td>Cover attribution text.</td></tr>
    <tr><td><code>revised</code></td><td>string</td><td><code>YYYY-MM-DD</code> revision date.</td></tr>
    <tr><td><code>publishedOrder</code></td><td>integer</td><td>Sort order for adventures sharing one source.</td></tr>
    <tr><td><code>parentSource</code></td><td>string</td><td>Parent source for anthologies / product packages.</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>alAveragePlayerLevel</code></td><td>integer</td><td>Adventurers League average player level (homebrew only).</td></tr>
    <tr><td><code>alLength</code></td><td>object</td><td>Adventurers League length in hours — <code>{min, max}</code> or <code>{exact}</code> (homebrew only).</td></tr>
    <tr><td><code>alId</code></td><td>string</td><td>Adventurers League id (homebrew only).</td></tr>
  </tbody>
</table>

No other keys are permitted — the adventure object is closed, so a typo is a validation error rather than a silently ignored field.

---

## Inline Tags

| Tag                                                  | Example                                                        | Use                                     |
| ---------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| `{@adventure name\|id}`                              | `{@adventure Lost Mine of Phandelver\|LMoP}`                   | Link to a whole adventure               |
| `{@adventure displayText\|id\|chapter\|section}`     | `{@adventure Chapter 2\|LMoP\|2\|goblin arrows}`               | Deep-link into an adventure chapter     |
| `{@book name\|id}`                                   | `{@book Exploring Eberron\|ExploringEberron24}`                | Link to a book (the `book` analogue)    |

---

## Examples

### Example 1: Minimal homebrew adventure

```json
{
  "name": "The Sunken Barrow",
  "id": "SBW",
  "source": "SBW",
  "group": "homebrew",
  "published": "2026-06-15",
  "storyline": "Miscellaneous",
  "author": "Jane Homebrewer",
  "level": { "start": 1, "end": 4 },
  "contents": [
    { "name": "Introduction" },
    {
      "name": "Into the Barrow",
      "ordinal": { "type": "chapter", "identifier": 1 },
      "headers": ["The Cracked Seal", { "header": "Barrow Wight", "statblock": true }]
    },
    { "name": "Appendix A: Magic Items", "ordinal": { "type": "appendix", "identifier": "A" } }
  ]
}
```

### Example 2: Organized-play module with AL metadata

```json
{
  "name": "Shadows over Bezantur",
  "id": "SOB",
  "source": "SOB",
  "parentSource": "MyBrewAnthology",
  "publishedOrder": 2,
  "group": "organized-play",
  "published": "2026-02-01",
  "revised": "2026-03-10",
  "storyline": "Thay",
  "level": { "custom": "Tier 2 (levels 5–10)" },
  "cover": {
    "type": "external",
    "url": "https://raw.githubusercontent.com/TheGiddyLimit/homebrew-img/refs/heads/main/img/SOB/cover.webp"
  },
  "coverCredit": "Art by Jane Doe, used with permission",
  "alAveragePlayerLevel": 7,
  "alLength": { "exact": 4 },
  "alId": "DDAL-SOB-02",
  "contents": [
    { "name": "Adventure Primer" },
    { "name": "The Tharchion's Summons", "ordinal": { "type": "part", "identifier": 1 } }
  ]
}
```

---

## Common Mistakes

1. **Missing `level` or `storyline`.** Both are required on adventures but have no counterpart on books.
2. **Using a book-only `group`.** `"core"`, `"setting"`, `"setting-alt"`, `"screen"`, `"recipe"`, and `"homecraft"` are valid for `book` but not for `adventure`.
3. **Mixing the two `level` forms.** `{ "start": 1, "custom": "Any" }` fails — pick one closed form.
4. **Adding `legacy`.** Not a valid adventure key.
5. **`id` / `source` mismatch between `adventure` and `adventureData`.** Both must be identical for the content to resolve.
6. **A `contents` entry whose `name` does not match the `adventureData` top-level entry name.** Navigation silently fails to land on the chapter.

---

## Schema Reference

The `adventure` array is validated against `5etools-utils/schema/brew/adventures.json` (`schema-template/adventures.json`, v1.10.37, `#/properties/adventure/items`). Shared `contents`, `cover`, `coverCredit`, `published`, and `parentSource` definitions come from `corpus-shared.json`. Each entry's page content is supplied separately in the `adventureData` array, validated against `corpus-shared.json#/$defs/wrappedAdventureBookDataArray` — see [bookData conversion](bookdata-conversion.md). Keep `id` and `source` identical across the matching `adventure` and `adventureData` entries.
