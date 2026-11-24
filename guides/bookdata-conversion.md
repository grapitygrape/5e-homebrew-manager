# Book Data `bookData`

The `bookData` array holds the **actual page content** of a homebrew book — the chapters, sections, text, tables, and images that render when a reader opens the book. The book's metadata and table of contents live separately in the `book` array; see [book conversion](book-conversion.md).

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

Each `bookData` entry pairs with one `book` entry that shares the same `id` and `source`. The book's `contents` table of contents is what links into the chapters defined here, so the top-level entry `name`s in `data` should match the `contents[].name` values in the matching `book` entry.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>id</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Short identifier of the book this content belongs to. Must exactly match the <code>id</code> of the corresponding entry in the <code>book</code> array (and, by convention, the <code>source</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>) and the <code>source</code> of the matching <code>book</code> entry.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>data</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      The ordered chapter content (at least one item). Each item is a standard <strong>entry object</strong> — almost always a top-level <code>"section"</code> whose <code>name</code> matches a <code>contents[].name</code> in the <code>book</code> entry. Inside, <code>entries</code> holds the renderable content: plain strings (paragraphs), and nested entry objects such as <code>entries</code>, <code>list</code>, <code>table</code>, <code>image</code>, <code>inset</code>, and <code>quote</code>. See the field shapes below.
    </div>
  </div>
</div>

> **No optional top-level fields.** A `bookData` entry accepts only `id`, `source`, and `data` (`additionalProperties: false`). All variety lives _inside_ `data` as nested entry objects.

---

## The `data` entry tree

`data` is an array of recursive entry objects (validated against `entry.json`). These are _inner_ fields of the entry objects, not top-level `bookData` properties. The common building blocks of a section are:

- **`type`** (string) — the entry kind. Top-level chapters use `"section"`. Nested blocks commonly use `"entries"` (a titled sub-block), `"list"`, `"table"`, `"image"`, `"inset"`, `"insetReadaloud"`, and `"quote"`.
- **`name`** (string) — heading text for a `section`/`entries` block. A top-level section's `name` should match its `book.contents` entry; nested `name`s become the chapter's `headers`.
- **`entries`** (array) — child content: plain strings (paragraphs, which may contain inline tags) and further nested entry objects.
- **`id`** (string, optional) — a stable anchor for a section, used for deep-linking (e.g. `"000"`). Distinct from the top-level `bookData.id`.

Other entry types you will use inside `data`:

- **`image`** — `{ "type": "image", "href": { "type": "external", "url": "https://…webp" }, "credit": "Artist" }`. The `href` follows the same internal/external rules as a book `cover`.
- **`list`** — `{ "type": "list", "items": ["…", { "type": "item", "name": "Trait", "entries": ["…"] }] }`.
- **`table`** — `{ "type": "table", "caption": "…", "colLabels": [...], "colStyles": [...], "rows": [[...]] }`.
- **`inset` / `insetReadaloud`** — a sidebar / boxed read-aloud block with `name` and `entries`.
- **`quote`** — `{ "type": "quote", "entries": ["…"], "by": "Speaker" }`.
- **`wrapper`** — passes styling/data through to a child entry without rendering a block of its own: `{ "type": "wrapper", "wrapped": { … }, "data": { "rd-my-flag": true } }`. To wrap several entries in one go, use `wrappeds` (an array) instead of `wrapped` — a wrapper takes one or the other, never both.

### Embedded statblocks

Statblocks embedded in book (or adventure) page content use a `statblock` entry. Set `data.slotSize` to cap the rendered height and prevent layout shifts while scrolling:

```json
{
  "type": "statblock",
  "data": {
    "creature": "Goblin",
    "source": "MM",
    "slotSize": "360"
  }
}
```

Allowed `slotSize` values are pixel heights: `"120"`, `"200"`, `"360"`, `"600"`, `"800"`, `"1000"`.

---

## Inline Tags

Book text uses the full inline-tag vocabulary inside its strings. Common ones:

| Tag                       | Example                         | Use                |
| ------------------------- | ------------------------------- | ------------------ |
| `{@book text              | id                              | chapter            | section}`                | `{@book see Chapter 2       | MLS | 2}` | Cross-reference within a book |
| `{@i text}` / `{@b text}` | `{@i Eberron Campaign Setting}` | Italic / bold      |
| `{@creature name}`        | `{@creature Sahuagin}`          | Link to a creature |
| `{@spell name}`           | `{@spell fireball}`             | Link to a spell    |
| `{@item name}`            | `{@item longsword}`             | Link to an item    |
| `{@area id                | displayText                     | flags}`            | `{@area Droaam\|197\|x}` | Link to a numbered map area |
| `{@race name              | source}`                        | `{@race Sahuagin   | ExploringEberron24}`     | Link to a species/race      |

---

## Examples

### Example 1: Minimal chapter

A single section whose `name` matches a `book.contents` entry.

```json
{
  "id": "MLS",
  "source": "MLS",
  "data": [
    {
      "type": "section",
      "name": "New Subclasses",
      "id": "001",
      "entries": [
        "This chapter introduces two new subclasses for use in your campaign.",
        {
          "type": "entries",
          "name": "The Stormcaller",
          "entries": ["Stormcallers channel the fury of the open sky..."]
        }
      ]
    }
  ]
}
```

### Example 2: Front matter with image and rich entries

A Preface section opening with a credited image, then body paragraphs containing inline tags.

```json
{
  "id": "ExploringEberron24",
  "source": "ExploringEberron24",
  "data": [
    {
      "type": "section",
      "name": "Preface",
      "id": "000",
      "entries": [
        {
          "type": "image",
          "href": {
            "type": "external",
            "url": "https://raw.githubusercontent.com/TheGiddyLimit/homebrew-img/refs/heads/main/img/ExploringEberron24/Book/000-00-002.warforged-rose.webp"
          },
          "credit": "Olie Bolador"
        },
        "When first designing the world, I included aquatic nations — considering the civilizations that the {@race Sahuagin|ExploringEberron24} and other intelligent undersea species might build.",
        "I always hoped we might see a {@i Planes of Eberron} sourcebook, building on {@book Eberron: Rising from the Last War|ERLW}."
      ]
    }
  ]
}
```

---

## Schema Reference

The `bookData` array is validated against `5etools-utils/schema/brew/corpus-shared.json` (`#/$defs/wrappedAdventureBookDataArray`), the same definition `adventureData` uses; each entry's `data` resolves to `util.json#/$defs/adventureBookData`, an array of `entry.json` objects (minimum one). The metadata + table of contents live in the `book` array — see [book conversion](book-conversion.md). Keep `id` and `source` identical across the matching `book` and `bookData` entries.
