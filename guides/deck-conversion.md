# Decks `deck` / `card`

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
  "deck": [ ... ],
  "card": [ ... ]
}
```

A deck is split across **two arrays that must both be present**: `deck` holds the deck definition (name, card list, optional spreads), and `card` holds the individual cards. A file with a `deck` but no `card` array — or vice versa — fails validation.

---

## What is a deck?

A **deck** is an ordered list of cards (a Deck of Many Things, a tarokka deck, a random-encounter deck). The deck object itself does not contain card text; it references cards by UID (`"name|source"`) from the `card` array, so the same card can be reused across decks and duplicate cards can be listed explicitly to control ordering.

Optionally a deck also declares **spreads** — named layouts (a three-card past/present/future draw, a Ravenloft reading) that describe how many cards to draw, which suits each position may draw from, and what each drawn card means at that position.

---

## Property Reference

### Required (`deck`)

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The deck's display name, e.g. <code>"Tarokka Deck"</code>.</div>
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
      <code>cards</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      The cards in the deck, at least one. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>count</code> <span class="prop-type">integer</span> and/or <code>replacement</code> <span class="prop-type">true</span> (the card is returned to the deck after being drawn). The object form needs at least one key besides <code>uid</code>, and no other keys are allowed. Duplicate entries <em>are</em> permitted, so repeated cards can be ordered explicitly.
      <pre><code class="language-json">"cards": [
  "Artifact|MyBrew",
  { "uid": "Balance|MyBrew", "count": 2 },
  { "uid": "The Fates|MyBrew", "replacement": true }
]</code></pre>
    </div>
  </div>
</div>

### Optional (`deck`)

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Description / rules text for the deck as a whole.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>back</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">An <code>image</code> entry used as the shared card back for the deck. Cards may override it with their own <code>back</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasCardArt</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Filter hint — whether this deck has real card art, used to decide if it is filtered out by default.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spreads</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Named draw layouts for the deck. At least one item, no duplicates. See <a href="#spreads">Spreads</a> below.</div>
  </div>
</div>

> There is **no `edition` property** on a deck. Edition is declared once for the file in <code>_meta.edition</code> — see [meta.md](meta.md).

---

## Complete Property Index — `deck`

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Deck name (required).</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Other books in which the deck is also printed.</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Other books which reference the deck.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this deck. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>cards</code></td><td>array</td><td>Card UIDs / card objects making up the deck (required, at least one). Duplicates allowed.</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Deck-level description text.</td></tr>
    <tr><td><code>spreads</code></td><td>array</td><td>Named draw layouts (at least one, unique).</td></tr>
    <tr><td><code>back</code></td><td>object</td><td>Default card-back <code>image</code> entry.</td></tr>
    <tr><td><code>hasCardArt</code></td><td>boolean</td><td>Filter hint for default card-art filtering.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another deck, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys.</td></tr>
  </tbody>
</table>

`srd`, `srd52`, `basicRules`, and `basicRules2024` are site-only and are not accepted in homebrew.

---

## Complete Property Index — `card`

Every `card` entry requires `name`, `source`, **and `set`**. `set` is the grouping key that ties the card to its deck family (e.g. `"tarokka"`).

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Card name (required).</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>set</code></td><td>string</td><td>Card-set identifier (required).</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Other books in which the card is also printed.</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Other books which reference the card.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) superseding this card.</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>The card's text.</td></tr>
    <tr><td><code>face</code></td><td>object</td><td><code>image</code> entry for the card face.</td></tr>
    <tr><td><code>back</code></td><td>object</td><td><code>image</code> entry for this card's back, overriding the deck's.</td></tr>
    <tr><td><code>suit</code></td><td>string</td><td>Suit name, e.g. <code>"Swords"</code>. Omit for suitless cards.</td></tr>
    <tr><td><code>value</code></td><td>integer</td><td>Numeric rank within the suit.</td></tr>
    <tr><td><code>valueName</code></td><td>string</td><td>Display name for the rank, e.g. <code>"Master"</code>.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another card, then override. See the <a href="Spec_Copy.md">Copy spec</a>.</td></tr>
  </tbody>
</table>

---

<h2 id="spreads">Spreads</h2>

`spreads` is an array of **spread objects** describing named layouts for drawing from the deck. Minimum one item, no duplicates.

### `_deckSpread` — a single spread

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The spread's name, e.g. <code>"Fortunes of Ravenloft"</code>. <strong>Required.</strong></div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier (a <code>_meta.sources[].json</code> value) for the spread. <strong>Required</strong> — a spread carries its own source, so a spread printed in a later book can sit on a deck defined elsewhere.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>positions</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">The positions in the layout, in draw order. <strong>Required</strong>, at least one. See <code>_deckSpreadPosition</code> below.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the spread's source.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Introductory / procedural text for the spread.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>seeAlsoAdventureHeader</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      UIDs of <em>adventure</em> headers to link as a "See Also" footnote. At least one, unique. Each is a header UID string of the form <code>"header|source|chapter|entry"</code>.
      <pre><code class="language-json">"seeAlsoAdventureHeader": ["Fortunes of Ravenloft|CoS|2|Fortunes of Ravenloft"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>seeAlsoBookHeader</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Same shape as <code>seeAlsoAdventureHeader</code>, but pointing at <em>book</em> headers.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>outcomes</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Card outcomes shared by <em>all</em> positions in this spread. See <a href="#outcomes">Outcomes</a>.</div>
  </div>
</div>

No other keys are permitted — the spread object is closed, so a typo is a validation error rather than a silently ignored field.

### `_deckSpreadPosition` — one slot in the layout

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">What this position means ("This card tells of history..."). <strong>Required</strong>, at least one entry.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val"><strong>Optional.</strong> A label for the position, e.g. <code>"Past"</code>. (This was required when spreads were first added and has since been relaxed — an unnamed position is now valid.)</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>suits</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      The suits this position may draw from — an array of suit-name strings, at least one, unique. Omit the key entirely to draw from the whole deck.
      <pre><code class="language-json">"suits": ["Swords", "Coins", "None"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>outcomes</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Card outcomes specific to this position. These <strong>override</strong> the spread-level <code>outcomes</code>. See <a href="#outcomes">Outcomes</a>.</div>
  </div>
</div>

> **Suitless cards use the string `"None"`, not `null`.** To let a position draw cards that have no `suit`, write the literal string `"None"` in `suits`. JSON `null` was accepted in the first version of the spread schema and is now rejected — `"suits": [null]` is a validation error.

<h3 id="outcomes">Outcomes (<code>_deckSpreadOutcomes</code>)</h3>

`outcomes` maps a drawn card to a piece of content elsewhere in the corpus (adventure/book). It is a three-level nested object:

1. **Corpus type** — `"adventure"` and/or `"book"`. At least one must be present; no other keys are allowed.
2. **Corpus key** — the id of the adventure/book the outcome text lives in. At least one key.
3. **Card pattern → outcome string** — the property name is a card pattern of the form `name|source|set`, all lowercase, with exactly two pipes and no uppercase letters (pattern `^[^A-Z|]+\|[^A-Z|]+\|[^A-Z|]+$`). The value is the outcome string. At least one entry.

```json
"outcomes": {
  "adventure": {
    "cos": {
      "artifact|cos|tarokka": "Chapter 3: The Tome of Strahd",
      "beast|cos|tarokka": "Chapter 13: Werewolf Den"
    }
  }
}
```

Position-level `outcomes` and spread-level `outcomes` share this shape; where both define the same card, the position's entry wins.

---

## Example: deck with a spread

```json
{
  "deck": [
    {
      "name": "Deck of Portents",
      "source": "MyBrew",
      "page": 42,
      "hasCardArt": true,
      "entries": [
        "This deck of 14 cards is used to divine a creature's fate."
      ],
      "cards": [
        "The Tower|MyBrew",
        "The Broken One|MyBrew",
        { "uid": "The Fates|MyBrew", "count": 2 }
      ],
      "spreads": [
        {
          "name": "Three-Card Reading",
          "source": "MyBrew",
          "page": 43,
          "entries": [
            "The reader draws three cards and lays them left to right."
          ],
          "seeAlsoAdventureHeader": [
            "Fortunes of Ravenloft|CoS|2|Fortunes of Ravenloft"
          ],
          "positions": [
            {
              "name": "Past",
              "entries": ["This card tells of a force from the subject's history."],
              "suits": ["Swords", "None"]
            },
            {
              "name": "Present",
              "entries": ["This card sheds light on the subject's current struggle."]
            },
            {
              "name": "Future",
              "entries": ["This card reveals what is yet to come."],
              "outcomes": {
                "adventure": {
                  "mybrewadv": {
                    "the tower|mybrew|portents": "Chapter 4: The Shattered Spire"
                  }
                }
              }
            }
          ]
        }
      ]
    }
  ],
  "card": [
    {
      "name": "The Tower",
      "source": "MyBrew",
      "set": "portents",
      "suit": "Swords",
      "value": 9,
      "entries": ["Ruin comes swiftly to the proud."]
    }
  ]
}
```

---

## Common Mistakes

1. **Only one of the two arrays.** `deck` and `card` are both required at the file root.
2. **Missing `set` on a card.** Cards require `name`, `source`, **and** `set`; decks require `name`, `source`, and `cards`.
3. **`null` in `suits`.** Use the string `"None"` for suitless cards.
4. **Uppercase or wrong pipe count in an outcome key.** Outcome card patterns are lowercase `name|source|set` with exactly two pipes.
5. **Spread missing `source`.** A spread carries its own `source` alongside `name` and `positions`; the deck's source is not inherited.
6. **Adding `edition` to a deck.** Decks are closed objects with no `edition` key — set `_meta.edition` for the file instead.

---

## Schema References

- **Deck / card schema:** `5etools-utils/schema/brew/decks.json` (`schema-template/decks.json`, v1.1.0) — `#/$defs/deck`, `#/$defs/card`, and the spread definitions `#/$defs/_deckSpread`, `#/$defs/_deckSpreadPosition`, `#/$defs/_deckSpreadOutcomes`, `#/$defs/_deckSpreadSeeAlsoHeader`.
- **`_meta` block:** [meta.md](meta.md)
- **Copy / inheritance:** [Spec_Copy.md](Spec_Copy.md)
- **Entry types:** `5etools-utils/schema/brew/entry.json` (including the inline `statblock` `card` tag).
- **Items referencing decks:** the `seeAlsoDeck` item property, see [item-conversion.md](item-conversion.md).
