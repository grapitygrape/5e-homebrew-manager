# Books `book`

The `book` array holds the **metadata + table of contents** for a homebrew book (a non-adventure sourcebook such as a setting guide or player supplement). It is the index entry that makes the book appear in the navbar and Search. The actual page content lives in a separate `bookData` array — see [bookData conversion](bookdata-conversion.md).

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
  "book": [ ... ],
  "bookData": [ ... ]
}
```

A book is split across the two arrays: every `book` entry should have a matching `bookData` entry whose `id` and `source` are identical.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The book's display title, e.g. <code>"Exploring Eberron (2024)"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>id</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Short identifier used to reference this book in tags (e.g. <code>{@book ...}</code>) and to link to the matching <code>bookData</code> entry. By convention it matches the <code>source</code>. Must satisfy the source-string pattern (1–2 chars, or 3+ chars that start and end with an alphanumeric).
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
      Navbar category the book is listed under. One of: <code>"core"</code>, <code>"supplement"</code>, <code>"supplement-alt"</code>, <code>"setting"</code>, <code>"setting-alt"</code>, <code>"prerelease"</code>, <code>"homebrew"</code>, <code>"screen"</code>, <code>"organized-play"</code>, <code>"recipe"</code>, <code>"homecraft"</code>, <code>"other"</code>. Most homebrew uses <code>"homebrew"</code> or a <code>setting</code>/<code>supplement</code> value.
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
      <code>contents</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      The linked table of contents (at least one entry). Each item is an object with:
      <ul>
        <li><code>name</code> <span class="prop-type">string</span> (required) — the chapter/section title. Must match the <code>name</code> of the corresponding top-level entry in <code>bookData.data</code> so navigation resolves.</li>
        <li><code>headers</code> <span class="prop-type">array</span> (optional) — sub-headings within the chapter. Each item is either a plain string, or an object with <code>header</code> <span class="prop-type">string</span> (required) plus any of <code>depth</code> <span class="prop-type">integer</span>, <code>index</code> <span class="prop-type">integer</span> (selects the Nth repeated heading of the same name, 0-based), <code>source</code> <span class="prop-type">string</span> (the source the heading belongs to, when it differs from the book's own), <code>statblock</code> <span class="prop-type">true</span> (marks the heading as an embedded statblock so it links to the statblock rather than the surrounding prose), <code>tag</code> <span class="prop-type">string</span> (the renderer tag identifying what kind of entity the statblock is, so the link resolves to the tagged entity), and <code>uid</code> <span class="prop-type">string</span> (the UID of that specific entity, e.g. a subclass statblock header). No other keys are permitted — the header object is closed, so a typo is a validation error rather than a silently ignored field.
          <pre><code class="language-json">"headers": [
  "The Stormcaller",
  { "header": "Treasure", "index": 1 },
  { "header": "Ashen Wraith", "statblock": true },
  {
    "header": "Path of the Spellblade",
    "statblock": true,
    "tag": "subclass",
    "uid": "Spellblade|Barbarian|PHB|MLS"
  }
]</code></pre>
          <p><strong>Dependency rules (<code>dependentRequired</code>).</strong> Three of these keys may not appear on their own:</p>
          <ul>
            <li><code>source</code> requires <code>statblock</code>.</li>
            <li><code>tag</code> requires <em>both</em> <code>statblock</code> and <code>uid</code>.</li>
            <li><code>uid</code> requires <em>both</em> <code>statblock</code> and <code>tag</code>.</li>
          </ul>
          <p>In other words <code>tag</code> and <code>uid</code> are always used together, and neither is valid without <code>"statblock": true</code> on the same header object. A header with <code>tag</code> but no <code>uid</code> (or with either but no <code>statblock</code>) is a validation error.</p></li>
        <li><code>ordinal</code> <span class="prop-type">object</span> (optional) — numbering shown in the navbar: <code>{ "type": string, "identifier": integer | string }</code>. <code>type</code> (required) is one of <code>"chapter"</code>, <code>"appendix"</code>, <code>"part"</code>, <code>"episode"</code>, <code>"level"</code>, <code>"section"</code>. Front/back matter such as a Preface or Credits omits <code>ordinal</code>.</li>
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
    <div class="prop-card-val">Author credit displayed for the book, e.g. <code>"Keith Baker"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>cover</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Cover image (preferred 300×300 or 600×600). One of two forms:
      <pre><code class="language-json">"cover": { "type": "internal", "path": "covers/MyBook.webp" }</code></pre>
      <pre><code class="language-json">"cover": { "type": "external", "url": "https://example.com/cover.webp" }</code></pre>
      Internal <code>path</code> must end in <code>.webp</code>, <code>.mp3</code>, or <code>.opus</code>. External <code>url</code> must start with <code>http(s)://</code> and must only point to the source content.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>coverCredit</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Attribution for the cover image, shown alongside it. Free text — name the artist and, where relevant, the licence.
      <pre><code class="language-json">"coverCredit": "Art by Jane Doe, used with permission"</code></pre>
    </div>
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
      <code>parentSource</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">A source identifier used when several books are bundled under one parent product (a “package” of related books).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alias</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Alternate names (strings) the book can be found under in Search.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>legacy</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">When present it must be <code>true</code>. Marks the book as superseded/legacy content so the UI can flag it.</div>
  </div>
</div>

---

## Inline Tags

| Tag                 | Example | Use                       |
| ------------------- | ------- | ------------------------- |
| `{@book name        | id}`    | `{@book Exploring Eberron | ExploringEberron24}` | Link to a whole book                                            |
| `{@book displayText | id      | chapter                   | section}`            | `{@book Chapter 2                                               | ExploringEberron24 | 2   | species of eberron}` | Deep-link into a book chapter/section |
| `{@adventure name   | id}`    | `{@adventure Lost Mine    | LMoP}`               | Link to an adventure (the `adventure`/`adventureData` analogue) |

---

## Examples

### Example 1: Minimal homebrew sourcebook

A small supplement with two chapters and front matter. Note the Preface omits `ordinal`.

```json
{
  "name": "My Little Sourcebook",
  "id": "MLS",
  "source": "MLS",
  "group": "homebrew",
  "published": "2026-06-15",
  "author": "Jane Homebrewer",
  "cover": {
    "type": "internal",
    "path": "covers/MLS.webp"
  },
  "contents": [
    { "name": "Preface" },
    {
      "name": "New Subclasses",
      "ordinal": { "type": "chapter", "identifier": 1 },
      "headers": ["The Stormcaller", "The Ironheart"]
    },
    {
      "name": "New Spells",
      "ordinal": { "type": "chapter", "identifier": 2 }
    }
  ]
}
```

### Example 2: Setting book with external cover and rich contents

A larger setting book using an external cover, repeated-header indexing, and an appendix.

```json
{
  "name": "Exploring Eberron (2024)",
  "id": "ExploringEberron24",
  "source": "ExploringEberron24",
  "group": "setting-alt",
  "cover": {
    "type": "external",
    "url": "https://raw.githubusercontent.com/TheGiddyLimit/homebrew-img/refs/heads/main/img/ExploringEberron24/cover.webp"
  },
  "published": "2026-01-28",
  "author": "Keith Baker",
  "contents": [
    { "name": "Preface" },
    {
      "name": "Planes of Existence",
      "ordinal": { "type": "chapter", "identifier": 5 },
      "headers": [
        "Eberron and Its Planes",
        { "header": "Treasure", "index": 1 }
      ]
    },
    {
      "name": "Friends and Foes",
      "ordinal": { "type": "appendix", "identifier": "A" }
    },
    { "name": "Credits" }
  ]
}
```

---

## Schema Reference

The `book` array is validated against `5etools-utils/schema/brew/books.json` (`#/properties/book/items`). Each entry’s page content is supplied separately in the `bookData` array, validated against `corpus-shared.json#/$defs/wrappedAdventureBookDataArray` — see [bookData conversion](bookdata-conversion.md). Keep `id` and `source` identical across the matching `book` and `bookData` entries.
