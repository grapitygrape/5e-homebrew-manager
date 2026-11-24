# JSON `"_copy"` Spec

The copy system allows an existing creature, item, or other implemented data-type to be copied, with modifications, to create a new creature, item, etc..

## Homebrew Metadata

When using `"_copy"` as part of a homebrew file, dependencies need to be declared so that the site loads data in the correct order.
The `"_meta"` property can contain a list of `"dependencies"`, `"internalCopies"` and `"includes"` when needed.

### dependencies

Dependencies are declared on site source files as a map in the following format:

```jsonc
"<data property>": [
    "<JsonSource1>",
    ...,
    "<JsonSourceN>"
]
```

#### Note

Entities from these sources can then be extended/referenced in this file. When copying classes/subclasses/class features/subclass features, the array should consist of `"<classIdentifier1>", ..., "<classIdentifierN>"` items, where `"classIdentifierN"` matches the keys in `"data/class/index.json"`.

When copying class/etc. homebrew, normal "source"-based linking applies.

### internalCopies

An array of keys that are copied from within the current document. e.g. `"item"`, `"monsterFluff"`, `"background"` etc.

### includes

`"includes"` is structured similarly to `"dependencies"` and enables the site to load additional content from other homebrew files that are stored in the homebrew repo.

### Example

An example homebrew file might contain the following information in it's `_meta` property:

```jsonc
"dependencies": {
    "monster": [    // Use the property name first
        "MM",       // Then the source ID
        "GHPG"      // Homebrew sources can also be used, but must be stored in the repo
    ],
    "monsterFluff": [
        "MM",
        "GHPG"
    ],
    "subclass": [
        "fighter",  // Note the use of the class name for (sub)class(Feature) dependencies
        "GHPG"      // Homebrew (sub)class(Feature) dependencies use the normal source
    ]
},
"internalCopies": [ // A list of properties from the current document that are copied
    "monsterFluff",
    "item"
],
"includes": {       // A map of properties to be loaded from sources
    "spell": [
        "GHPG"
    ]
}
```

## Usage of `"_copy"`

```jsonc
{
  // replace values from the copy with values specified in the root
  // (N.B. these are kept in the root to ease external tooling, instead of doing e.g.:
  //    `name = name || _copy._set.name` we should always have basic info at the root level)
  "name": "New Name",
  "source": "New Source",
  "page": 123,
  "int": 10,

  "_copy": {
    "name": "Name of original",
    "source": "Source of original",

    // modify existing properties
    // key dictates the data to modify
    // values can be:
    // - a string operation (e.g. "remove")
    // - an object operation (e.g. a "replaceTxt" operation with various options)
    // - an array containing either/both of the above
    "_mod": {
      // apply to all text properties
      // text properties are: "action", "reaction", "trait", "legendary", "variant", and "spellcasting"
      "*": [
        {
          "mode": "replaceTxt", // replace text
          "replace": "the captain",
          "with": "Embric",
          "flags": "i",
        },
      ],
      // alternate single-operation version
      "*": {
        "mode": "replaceTxt",
        "replace": "the captain",
        "with": "Embric",
        "flags": "i",
      },

      // apply to _no_ properties (used for "special" operations which have their own specific implementations)
      "_": {
        "mode": "addSenses",
        "senses": [],
      },

      "action": [
        // more on this syntax can be found later in the spec
        {
          "mode": "replaceArr",
          "replace": "Mace",
          "items": {
            "name": "Staff",
            "entries": ["{@atk mw} {@hit 8} to hit, reach5 ft., ..."],
          },
        },
      ],

      "variant": "remove", // remove a property
    },

    // some properties are removed by default (e.g. page) since they don't make sense on modified copies
    // this can be used to override that behaviour
    "_preserve": {
      "page": true,
    },

    // other properties, which depend on the data type (key of the array containing the object), e.g. ...
    // implementation is specific to whatever is intended to use the data
    "_templates": [
      {
        "name": "Awakened",
        "source": "PHB",
      },
    ],
  },
}
```

---

### Note: "<prop>Template" JSON Spec

Essentially the same as the `"_copy"`, with the information encapsulated in an `"apply"` property. Here, `"_root"` is used as an equivalent for values which would be held in the root for a normal copy object.

---

## The `"_copy"` block's own keys

Everything above describes what `_mod` can do. This is the block that contains it.
`_copy` is a **closed object** — `name` and `source` are required, and any key not
listed here is a validation error.

| Key          | Type   | Purpose                                                      |
| ------------ | ------ | ------------------------------------------------------------ |
| `name`       | string | Name of the entity being copied. **Required.**               |
| `source`     | string | Source of the entity being copied. **Required.**             |
| `_mod`       | object | The modifications to apply. See [Modes](#modes).             |
| `_templates` | array  | Templates to apply on top of the copy — see below.           |
| `_preserve`  | object | Root properties to carry over from the original — see below. |

### Pointing at the original

`name` + `source` identify most entities on their own. Entities that live inside a
parent need extra keys to disambiguate, and each is only meaningful for its own
data type:

| Key                 | Type    | Used in                     |
| ------------------- | ------- | --------------------------- |
| `pantheon`          | string  | deity data                  |
| `shortName`         | string  | subclass data               |
| `className`         | string  | subclass data               |
| `classSource`       | string  | subclass data               |
| `subclassShortName` | string  | subclass feature data       |
| `subclassSource`    | string  | subclass feature data       |
| `level`             | integer | subclass feature data       |
| `raceName`          | string  | race (species) feature data |
| `raceSource`        | string  | race (species) feature data |

A subclass copy therefore needs the subclass's own `name`/`source` _and_ the class
it belongs to:

```json
"_copy": {
  "name": "Path of the Berserker",
  "source": "PHB",
  "className": "Barbarian",
  "classSource": "PHB",
  "shortName": "Berserker"
}
```

A subclass _feature_ additionally pins the subclass and the level it sits at:

```json
"_copy": {
  "name": "Frenzy",
  "source": "PHB",
  "className": "Barbarian",
  "classSource": "PHB",
  "subclassShortName": "Berserker",
  "subclassSource": "PHB",
  "level": 3
}
```

### `_templates`

An array of `{ "name", "source" }` objects — both required, no other keys, no
duplicates, at least one entry. Each names a template to apply to the copied
entity, layered on after the copy resolves. Use this instead of hand-writing the
same `_mod` block across several entities.

```json
"_copy": {
  "name": "Guard",
  "source": "MM",
  "_templates": [{ "name": "Zombie", "source": "MM" }]
}
```

### `_preserve`

An object whose keys are root property names and whose values are always `true`.
Copy resolution normally drops the original's bookkeeping properties — this opts
individual ones back in.

```json
"_copy": {
  "name": "Longsword",
  "source": "PHB",
  "_preserve": { "page": true, "otherSources": true }
}
```

Writing `false` is not valid; omit the key instead.

---

## `"_versions"`

`_versions` generates several variants of an entity from one definition. It reuses
the same `_mod` / `_templates` / `_preserve` machinery as `_copy`, but the source
is the entity the block sits on rather than some other entry. Two forms.

### Explicit form

An array of variants, each with `name` and `source` (both required) and the usual
modification keys:

```json
"_versions": [
  {
    "name": "Boots of Striding and Springing (Large)",
    "source": "MyHomebrew",
    "_mod": { "entries": { "mode": "replaceTxt", "replace": "Medium", "with": "Large" } }
  }
]
```

Note the difference from `_copy`: for a version, **all properties are preserved by
default**. Pass `"_preserve": {}` to preserve nothing.

`_templates` is accepted here but is described upstream as largely unsupported and
unstable — avoid relying on it.

### Abstract / implementation form

When the variants differ only by a few values, write the shape once and supply the
values per variant. The object takes exactly two keys:

| Key                | Type   | Purpose                                                                                                                                                |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `_abstract`        | object | The template. Requires `name`, `source` and `_mod`; `_preserve` optional. Values may contain `{{variable}}` placeholders.                              |
| `_implementations` | array  | One entry per generated variant. Each requires `_variables`, an object supplying that variant's placeholder values. At least one entry, no duplicates. |

```json
"_versions": [
  {
    "_abstract": {
      "name": "Dragon Vessel ({{elemental}})",
      "source": "MyHomebrew",
      "_mod": {
        "entries": { "mode": "replaceTxt", "replace": "ELEMENT", "with": "{{elemental}}" }
      }
    },
    "_implementations": [
      { "_variables": { "elemental": "Fire" } },
      { "_variables": { "elemental": "Cold" } }
    ]
  }
]
```

The abstract form is a closed object — `_abstract` and `_implementations` only.

---

## Modes

Modifiers have modes, as listed below.

### General Modes

These modes are generally useful across all entity types.

#### replaceTxt

Regex replace text.

```jsonc
{
  "mode": "replaceTxt",
  "replace": "the captain", // regex pattern to match
  "with": "Embric", // text to insert as replacement
  "flags": "i", // regex flags to use ("g" is always included by default)
}
```

#### appendStr

Append a string to an existing string (with optional joiner), or add a new string.

```jsonc
{
  "mode": "appendStr",
  "str": "some text to append",
  "joiner": ", ",
}
```

#### prependArr

Prepend items to an array.

```jsonc
{
  "mode": "prependArr",
  // items can be a single item (shorthand)
  "items": {
    "name": "Control Water",
    "entries": ["..."],
  },
}
```

#### appendArr

Append items to an array.

```jsonc
{
  "mode": "appendArr",
  // items can be a single item (shorthand)
  "items": {
    "name": "Control Water",
    "entries": ["..."],
  },
}
```

#### replaceArr

Replace named items in an array.
If the item does not have a name, this falls back on trying to replace string literals.

```jsonc
{
  "mode": "replaceArr",
  "replace": "Mace", // name of target to replace
  // items can be an item or an array of items, or a string or array of strings
  "items": {
    // item to insert instead
    "name": "Staff",
    "entries": ["{@atk mw} {@hit 8} to hit, reach5 ft., ..."],
  },
}
```

`"replace"` can alternately be of the form:

```jsonc
{
    "regex": "a*b",
    "flags": "i"
},
// or
{
    "replace": {
        "index": 0 // replace item at index 0
    }
}
```

#### replaceOrAppendArr

Try to `replaceArr`, fall back on `appendArr`.

#### appendIfNotExistsArr

For each item, check if it exists in the target array; if not, append it to the target array.

```jsonc
{
  "mode": "appendIfNotExistsArr",
  // items can be an item or an array of items
  "items": ["charmed", "poisoned"],
}
```

#### insertArr

Insert items into an array at the specified index.
Note that these are applied in order of appearance. Note that index-based operations are brittle, and using them should therefore be avoided where possible.

```jsonc
{
  "mode": "insertArr",
  "index": 1,
  // items can be an item or an array of items
  "items": {
    "name": "Staff",
    "entries": ["{@atk mw} {@hit 8} to hit, reach5 ft., ..."],
  },
}
```

#### removeArr

Remove named or plain items from an array.

```jsonc
{
  "mode": "removeArr",
  // name/array of names of item to remove
  "names": "Mace",
  // alternatively, if string items are to be removed
  "items": ["fire", "cold"],
  // optional "-f" flag to avoid throwing errors on missing items -- useful for e.g. creature traits
  "force": true,
}
```

#### renameArr

Rename named items in an array.

```jsonc
{
  "mode": "renameArr",
  // renames can be an item or an array of items
  "renames": {
    "rename": "Mace (Powered Form Only)",
    "with": "Mace",
  },
}
```

#### setProp

Set a property on an object. Note that use of a more specific `mode` is preferred, as these will generally be more resilient against future schema changes.

```jsonc
{
  "mode": "setProp",
  "prop": "hp.formula",
  "value": "2d10+2",
}
```

#### calculateProp

Calculate a property, and add it to an object.

```jsonc
{
  "mode": "calculateProp",
  "prop": "stealth",
  "formula": "(<$prof_bonus$> * 2) + <$dex_mod$>",
}
```

Note that these are calculated using the current object values. The order of operations is as follows:

- (Copy original object)
- Apply root properties
- (Any other required steps, e.g. `_templates`s are applied)
- Sequentially apply `_mod`s, in order of appearance

Available variables are:

| Var          | Notes                         |
| ------------ | ----------------------------- |
| `prof_bonus` | Calculated from creature's CR |
| `dex_mod`    |                               |

---

#### scalarAddProp

Add a scalar to a number or number-like property.

```jsonc
{
  "mode": "scalarAddProp",
  // "prop": "*", this affects all properties
  "prop": "stealth",
  "scalar": 2,
}
```

#### scalarMultProp

Multiply a number or number-like property by a scalar

```jsonc
{
  "mode": "scalarMultProp",
  "prop": "average",
  "scalar": 2,
  "floor": true, // if the resulting value should be floor'd (useful for division)
}
```

#### prefixSuffixStringProp

Prefix/suffix a string or string-like property. Either or both of "prefix" and "suffix" may be specified.

```jsonc
{
  "mode": "prefixSuffixStringProp",
  "prop": "formula",
  "prefix": "2 * (",
  "suffix": ") + 10",
}
```

### Entity-Specific Modes

These modes are narrower in scope, usually targeting `"monster"` data, although may function for similar data structures.

#### addSenses

Add senses to a statblock. If the creature has greater range in the same senses as those that would be added, no changes are made.

```jsonc
{
  "mode": "addSenses",
  "senses": {
    "type": "darkvision",
    "range": 60,
  },
}
```

#### addSaves

Add saves to a statblock. If the creature has greater save for the same attribute, no changes are made.

```jsonc
{
  "mode": "addSaves",
  "saves": {
    "str": 1, // "1" is "proficient"
    "dex": 2, // "2" is "expertise"
  },
}
```

### addAllSaves

As per `addSaves`, but for all saving throws.

```jsonc
{
  "mode": "addAllSaves",
  "saves": 2, // "2" is "expertise"
}
```

#### addSkills

Add skills to a statblock. If the creature has greater skill bonuses in the same skills as those that would be added, no changes are made.

```jsonc
{
  "mode": "addSkills",
  "skills": {
    "perception": 1, // "1" is "proficient"
    "stealth": 2, // "2" is "expertise"
  },
}
```

### addAllSkills

As per `addSkills`, but for all skills.

```jsonc
{
  "mode": "addAllSkills",
  "skills": 2, // "2" is "expertise"
}
```

#### addSpells

Add spells to a spell trait. Requires the creature to already be a spellcaster, and only targets the first listed trait.

```jsonc
{
  "mode": "addSpells",
  "spells": {
    "0": {
      "spells": ["{@spell ray of frost}"],
    },
  },
}
```

#### replaceSpells

Replace spells in a spell trait. Requires the creature to already be a spellcaster, and only targets the first listed trait.

```jsonc
{
  "mode": "replaceSpells",
  "spells": {
    "4": [
      {
        "replace": "{@spell banishment}",
        "with": "{@spell dimension door}", // can be an array
      },
    ],
  },
  "daily": {
    "1e": [
      {
        "replace": "{@spell banishment}",
        "with": "{@spell dimension door}", // can be an array
      },
    ],
  },
}
```

#### removeSpells

Remove spells in a spell trait. Requires the creature to already be a spellcaster, and only targets the first listed trait.

```jsonc
{
  "mode": "removeSpells",
  "spells": {
    "4": ["{@spell banishment}"],
  },
  "daily": {
    "1e": ["{@spell banishment}"],
  },
}
```

#### scalarAddHit

Add a scalar to `@hit` tags in a statblock

```jsonc
{
  "mode": "scalarAddHit",
  "scalar": 2,
}
```

#### scalarAddDc

Add a scalar to `@dc` tags in a statblock

```jsonc
{
  "mode": "scalarAddDc",
  "scalar": 2,
}
```

#### maxSize

Set a statblock's `size` to the minimum of the present value and the value provided.

```jsonc
{
  "mode": "maxSize",
  // if the creature is "H" (huge), it will be set to "L" (large).
  //  Otherwise, it will keep it's current size
  "max": "L",
}
```

#### scalarMultXp

Multiply a creature's XP value by a scalar.

```jsonc
{
  "mode": "scalarMultXp",
  "scalar": 0.5,
  "floor": true, // if the resulting value should be floor'd (useful for division)
}
```
