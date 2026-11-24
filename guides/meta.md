# `_meta` frontmatter

Every homebrew file starts with a `_meta` block describing its source(s) and how the file should load. Four keys are **required**: `sources`, `dateAdded`, `dateLastModified`, and `edition`. A file missing any of them fails validation before a single entry is checked.

```json
{
  "$schema": "https://raw.githubusercontent.com/TheGiddyLimit/5etools-utils/master/schema/brew-fast/homebrew.json",
  "_meta": {
    "sources": [
      {
        "json": "MyHomebrew",
        "abbreviation": "MHB",
        "full": "My Homebrew Compendium",
        "version": "1.0.0",
        "authors": ["Jane Homebrewer"],
        "convertedBy": ["Author"],
        "url": "https://example.com/my-homebrew",
        "dateReleased": "2026-01-15",
        "color": "4a7d2f"
      }
    ],
    "dateAdded": 1768435200,
    "dateLastModified": 1768435200,
    "edition": "classic"
  }
}
```

## `sources`

An array of source objects, at least one. Every entry in the file sets `source` to one of these `json` values.

- **`json`** (string, **required**): The identifier every entry's `source` field uses. Rules the validator enforces:
  - At least **6 characters** — `"MB"` or `"HB1"` fail; use something like `"MyHomebrew"`.
  - Letters, digits, spaces, and `- & + !` only, and it can't start or end with a space.
  - Can't start with `UA` or `XUA` (reserved for Unearthed Arcana).
  - Can't be an official 5etools source code (`PHB`, `XPHB`, `DMG`, …).
- **`abbreviation`** (string, **required**): Short form displayed on the site, e.g. `"MHB"`. This is where the short code goes — not in `json`.
- **`full`** (string, **required**): Full title of the source.
- **`version`** (string, **required**): Source version, e.g. `"1.0.0"`.
- **`authors`** (array of strings): The original authors.
- **`convertedBy`** (array of strings): People who converted it to 5etools format.
- **`url`** (string): Link to the source's store page or web version.
- **`dateReleased`** (string): Publication date, `YYYY-MM-DD`.
- **`color`** / **`colorNight`** (string): Hex color for list views (day / night theme), without `#`, e.g. `"ff00ff"`.
- **`partnered`** (boolean): Mark a D&D Beyond "Partnered" source.
- **`targetSchema`** (string): The 5etools schema version the file targets, e.g. `"1.2.3"`.

## Dates

- **`dateAdded`** (integer, **required**): Epoch timestamp **in seconds** (not milliseconds) when the file was added.
- **`dateLastModified`** (integer, **required**): Epoch timestamp in seconds of the last edit.
- `_dateLastModifiedHash` is maintained by tooling — never create or edit it by hand.

## `edition`

**Required.** `"classic"` (2014 rules) or `"one"` (2024 rules); if the content is ambiguous, use `"classic"`. It decides tag sourcing — `{@item dagger|phb}` in a classic file, `{@item dagger|xphb}` in a `"one"` file — and a classic file that references a 2024 source anywhere (`source`, `_copy.source`, tags, `dependencies`, …) is reported as an error.

## Loading and linking

- **`dependencies`** (object): `"<data property>": ["<JsonSource>", …]` — brews whose entities this file extends or references (for `_copy`, `requires`, subclasses of a homebrew class, and so on). A tag that links to another brew's content counts: `{@spell arcane ablation|KT-CLL}` needs `"spell": ["KT-CLL"]`, keyed by the linked content's property. Without it the link only works when that brew happens to be loaded too. When copying official classes, subclasses, or their features, list class identifiers as they appear in `5etools/data/class/index.json` instead of sources.
  ```json
  "dependencies": { "subclass": ["ChroniclesOfEberron"], "item": ["XDMG"] }
  ```
- **`includes`** (object): Same shape as `dependencies`; extra sources loaded alongside this file.
- **`internalCopies`** (array of strings): Data properties whose entries `_copy` other entries **in this same file**, e.g. `["item", "monsterFluff"]`. List a property here whenever one of its entries copies a sibling in the same file.
- **`status`** (string): `"ready"` (usable and internally consistent), `"wip"` (incomplete or mid-migration), `"invalid"` (passes the schema but breaks clients), or `"deprecated"` (superseded by another brew).
- **`unlisted`** (`true`): Hide the file from indexers.
- **`fonts`** (object): Font family → font URL, for custom fonts used in entries.

## Type shorthand registries

Several entity types use short codes in list views. Register custom codes in `_meta` so they render with readable labels instead of raw strings.

| `_meta` key            | Value shape                                     | Used by                         | Guide                                                          |
| ---------------------- | ----------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| `optionalFeatureTypes` | `"code": "Label"`                               | `optionalfeature` `featureType` | [optionalfeature-conversion.md](optionalfeature-conversion.md) |
| `vehicleUpgradeTypes`  | `"code": "Label"`                               | `vehicleUpgrade` `upgradeType`  | [vehicleupgrade-conversion.md](vehicleupgrade-conversion.md)   |
| `featCategories`       | `"code": "Label"`                               | `feat` `category`               | [feat-conversion.md](feat-conversion.md)                       |
| `spellSchools`         | `"code": { "full": "…", "short": "…" }`         | `spell` `school`                | [spell-conversion.md](spell-conversion.md)                     |
| `psionicTypes`         | `"code": { "full": "…", "short": "…" }`         | `psionic` `type`                | —                                                              |
| `spellDistanceUnits`   | `"unit": { "feetPerUnit": 5, "singular": "…" }` | `spell` `range.distance.type`   | [spell-conversion.md](spell-conversion.md)                     |
| `currencyConversions`  | `"key": [{ "coin": "gp", "mult": 0.01 }]`       | `item` `currencyConversion`     | [item-conversion.md](item-conversion.md)                       |

Example combining several registries:

```json
{
  "_meta": {
    "sources": [
      {
        "json": "MyBrew",
        "abbreviation": "MB",
        "full": "My Homebrew",
        "version": "1.0.0"
      }
    ],
    "dateAdded": 1768435200,
    "dateLastModified": 1768435200,
    "edition": "classic",
    "optionalFeatureTypes": {
      "BM:Blade": "Blade Maneuver"
    },
    "vehicleUpgradeTypes": {
      "SHP:H": "Ship Upgrade, Hull"
    },
    "featCategories": {
      "O": "Origin"
    },
    "spellSchools": {
      "CH": { "full": "Chronomancy", "short": "Chrono." }
    }
  }
}
```
