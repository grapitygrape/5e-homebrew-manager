# Optional Features `optionalfeature`

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
  "optionalfeature": [ ... ]
}
```

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The feature's display name.</div>
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
      <code>featureType</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Array of type codes determining where the feature appears in filters and lists. See <a href="#feature-types">Feature Types</a> below.
      <pre><code class="language-json">"featureType": ["EI"]</code></pre>
      <pre><code class="language-json">"featureType": ["FS:F", "FS:R"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Description and mechanics of the feature.</div>
  </div>
</div>

---

## Feature Types

The `featureType` field accepts an array of type codes.

### Standard Feature Types

| Code     | Full Name               | Class/Feature               |
| -------- | ----------------------- | --------------------------- |
| `"EI"`   | Eldritch Invocation     | Warlock                     |
| `"AI"`   | Artificer Infusion      | Artificer                   |
| `"MM"`   | Metamagic               | Sorcerer                    |
| `"MV"`   | Maneuver                | General                     |
| `"MV:B"` | Maneuver, Battle Master | Fighter (Battle Master)     |
| `"AS"`   | Arcane Shot             | Fighter (Arcane Archer)     |
| `"ED"`   | Elemental Discipline    | Monk (Way of Four Elements) |
| `"PB"`   | Pact Boon               | Warlock                     |
| `"RN"`   | Rune Knight Rune        | Fighter (Rune Knight)       |
| `"OR"`   | Onomancy Resonant       | Wizard (Onomancy)           |
| `"AF"`   | Alchemical Formula      | Artificer (Alchemist)       |
| `"TT"`   | Traveler's Trick        | Various                     |
| `"RP"`   | Renown Perk             | Campaign-specific           |
| `"OTH"`  | Other                   | Miscellaneous options       |

### Fighting Styles

| Code     | Full Name               |
| -------- | ----------------------- |
| `"FS:F"` | Fighting Style; Fighter |
| `"FS:P"` | Fighting Style; Paladin |
| `"FS:R"` | Fighting Style; Ranger  |
| `"FS:B"` | Fighting Style; Bard    |

### UA / Variant Feature Types

| Code         | Full Name                  |
| ------------ | -------------------------- |
| `"MV:C2-UA"` | Maneuver, Cavalier V2 (UA) |
| `"AS:V1-UA"` | Arcane Shot, V1 (UA)       |
| `"AS:V2-UA"` | Arcane Shot, V2 (UA)       |

### Custom Feature Types

Homebrew can define new feature types in the `_meta` block:

```json
{
  "_meta": {
    "sources": [...],
    "optionalFeatureTypes": {
      "BM:Blade": "Blade Maneuver",
      "SW:Stance": "Sword Stance"
    }
  }
}
```

Always add custom type codes to `_meta.optionalFeatureTypes` — otherwise they appear as raw codes in the UI.

---

## Prerequisites

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>prerequisite</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Array of prerequisite objects. Properties within one object are AND logic; multiple objects are OR logic (meeting any is enough). Omit entirely if there are no requirements.

      <strong>Level prerequisite:</strong>
      <pre><code class="language-json">"prerequisite": [

{
"level": {
"level": 5,
"class": { "name": "Warlock" }
}
}
]</code></pre>

      <strong>Spell prerequisite:</strong>
      <pre><code class="language-json">"prerequisite": [

{ "spell": ["eldritch blast#c"] }
]</code></pre>

      <strong>Pact prerequisite</strong> (<code>"Tome"</code>, <code>"Blade"</code>, <code>"Chain"</code>, <code>"Talisman"</code>):
      <pre><code class="language-json">"prerequisite": [

{ "pact": "Tome" }
]</code></pre>

      <strong>Feature prerequisite:</strong>
      <pre><code class="language-json">"prerequisite": [

{ "feature": ["Spellcasting or Pact Magic feature"] }
]</code></pre>

      <strong>Proficiency prerequisite:</strong>
      <pre><code class="language-json">"prerequisite": [

{
"proficiency": [
{ "armor": "medium" },
{ "weapon": "martial" }
]
}
]</code></pre>

      <strong>Combined (AND) — Level 12 Warlock with Talisman pact:</strong>
      <pre><code class="language-json">"prerequisite": [

{
"level": { "level": 12, "class": { "name": "Warlock" } },
"pact": "Talisman"
}
]</code></pre>

      <strong>Alternative (OR) — Level 5 Warlock OR Sorcerer:</strong>
      <pre><code class="language-json">"prerequisite": [

{ "level": { "level": 5, "class": { "name": "Warlock" } } },
{ "level": { "level": 5, "class": { "name": "Sorcerer" } } }
]</code></pre>
</div>
  </div>
</div>

---

## Additional Spells

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalSpells</code>
      <span class="prop-type">array</span>
      Every supported key — display keys, class/subclass gating and its visibility flags, proficiency, spellcasting, and the content keys — is documented once in <a href="prerequisite-reference.md">prerequisite-reference.md</a>. The definition is shared, so that page is authoritative for all of them.
    </div>
    <div class="prop-card-val">
      Spells granted by the feature. Each entry can include <code>ability</code> (spellcasting ability), <code>innate</code> (at-will or limited-use), <code>known</code> (added to spell list), and <code>prepared</code>.

      <strong>At-will:</strong>
      <pre><code class="language-json">"additionalSpells": [

{ "innate": { "_": ["mage armor"] } }
]</code></pre>

      <strong>Daily (1/day each):</strong>
      <pre><code class="language-json">"additionalSpells": [

{
"innate": {
"_": { "daily": { "1e": ["compulsion"] } }
}
}
]</code></pre>

      <strong>Known spells (choose from list):</strong>
      <pre><code class="language-json">"additionalSpells": [

{
"ability": "cha",
"known": {
"_": [{ "choose": "level=0|class=cleric", "count": 2 }]
}
}
]</code></pre>

      <strong>2024 source suffix:</strong>
      <pre><code class="language-json">"additionalSpells": [

{ "innate": { "_": ["mage armor|xphb"] } }
]</code></pre>
</div>
  </div>
</div>

---

## Resource Consumption

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>consumes</code>
      <span class="prop-type">object</span>
      The full structure — group keys, the character-level vs spell-level distinction, every recharge category, and the uses keys (<code>"2e"</code>, <code>"pb"</code>, <code>"halfPb"</code>, <code>"mod"</code>, …) — is documented once in <a href="additionalspells-reference.md">additionalspells-reference.md</a>. The definition is shared, so that page is authoritative.
    </div>
    <div class="prop-card-val">
      Resource consumed when the feature is used (Superiority Dice, Ki Points, etc.).
      <pre><code class="language-json">"consumes": { "name": "Superiority Die" }</code></pre>
      <pre><code class="language-json">"consumes": { "name": "Ki Point", "amount": 2 }</code></pre>
    </div>
  </div>
</div>

---

## Proficiencies

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skillProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"skillProficiencies": [{ "deception": true, "persuasion": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>toolProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"toolProficiencies": [{ "thieves' tools": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Use <code>simple</code>, <code>martial</code>, <code>firearms</code>, or <code>improvised</code> for categories; individual weapons must be keyed <code>"name|source"</code> (a bare <code>"longsword"</code> fails validation).
      <pre><code class="language-json">"weaponProficiencies": [{ "longsword|phb": true, "shortsword|phb": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>itemMasteries</code>
      <span class="prop-type">array | true</span>
    </div>
    <div class="prop-card-val">
      Weapons the character can choose Weapon Mastery properties for. Same array shape as <code>weaponProficiencies</code>, or <code>true</code> to match the <code>weaponProficiencies</code> this entry grants. Pair it with <code>itemMasteriesProgression</code>.
      <pre><code class="language-json">"itemMasteries": [{ "simple": true, "martial": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>itemMasteriesProgression</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      How many weapon masteries this grants. Use <code>"*"</code> for a flat count. Level keys (<code>"1"</code>, <code>"4"</code>) are also accepted. Values are integers, and no other keys are allowed.
      <pre><code class="language-json">"itemMasteriesProgression": { "*": 1 }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>armorProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"armorProficiencies": [{ "medium": true, "shield": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>languageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"languageProficiencies": [{ "any": 2 }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skillToolLanguageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Combined choice across skills, tools, or languages.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>expertise</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"expertise": [{ "anyProficientSkill": 1 }]</code></pre>
    </div>
  </div>
</div>

---

## Other Properties

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>senses</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"senses": [{ "blindsight": 10 }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage resistances granted.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>immune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage immunities granted.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"conditionImmune": ["frightened"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>isClassFeatureVariant</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> when the feature replaces or is an alternative to a standard class feature.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Links to newer versions of the feature. <pre><code class="language-json">"reprintedAs": ["Agonizing Blast|XPHB"]</code></pre>
      Each entry is either a bare UID string, or an object when the reprint needs more than a UID:
      <ul>
        <li><code>uid</code> <span class="prop-type">string</span> (required) — the reprint's UID, e.g. <code>"longsword|xphb"</code>.</li>
        <li><code>tag</code> <span class="prop-type">string</span> — the renderer tag to link through (e.g. <code>"creature"</code>), for when the reprint is a different kind of entity.</li>
        <li><code>edition</code> <span class="prop-type">string</span> — <code>"classic"</code> or <code>"one"</code>, disambiguating a reprint that exists in both rule sets.</li>
      </ul>
      The object form must carry at least one key besides <code>uid</code> — with only a <code>uid</code>, use the bare string instead. No other keys are allowed, and duplicate entries are rejected.
      <pre><code class="language-json">"reprintedAs": [{ "uid": "NAME|XPHB", "edition": "one" }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>previousVersion</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Links to the older version this feature updates.
      <pre><code class="language-json">"previousVersion": { "name": "Agonizing Blast", "source": "PHB" }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other books where this feature appears.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source book.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>legacy</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Marks this as legacy (pre-2024) content when a 2024 version exists.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if this feature has a matching fluff entry in an external fluff file.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluffImages</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the matching fluff entry has images.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>fluff</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Embedded flavor text and images for homebrew.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources which reference this feature (e.g. in bold text).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage vulnerabilities granted by this feature.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>featProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Defines how feats are gained from this feature at each level.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>optionalfeatureProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Defines how optional features of specific types are gained from this feature at each level.</div>
  </div>
</div>

---

## Examples

### Example 1: Legacy Eldritch Invocation with Spell Prerequisite

A standard optional feature that requires the character to know a specific cantrip.

```json
{
  "name": "Agonizing Blast",
  "source": "PHB",
  "page": 110,
  "featureType": ["EI"],
  "prerequisite": [{ "spell": ["eldritch blast#c"] }],
  "entries": [
    "When you cast {@spell eldritch blast}, add your Charisma modifier to the damage it deals on a hit."
  ]
}
```

### Example 2: Fighting Style with Spellcasting and Variant Flags

A class feature variant representing a fighting style that grants cantrips from another class's list.

```json
{
  "name": "Blessed Warrior",
  "source": "TCE",
  "page": 52,
  "isClassFeatureVariant": true,
  "featureType": ["FS:P"],
  "additionalSpells": [
    {
      "ability": "cha",
      "known": {
        "_": [{ "choose": "level=0|class=cleric", "count": 2 }]
      }
    }
  ],
  "entries": [
    "You learn two cantrips of your choice from the {@filter cleric spell list|spells|level=0|class=Cleric}. They count as paladin spells for you, and Charisma is your spellcasting ability for them."
  ]
}
```

### Example 3: Homebrew Feature with Custom Type and Resource Consumption

A homebrew custom optional feature linked to a custom feature type defined in the file metadata, featuring level prerequisites and tracking resource consumption.

```json
{
  "name": "Spirit Strike",
  "source": "MyBrew",
  "page": 1,
  "featureType": ["BM:Soul"],
  "prerequisite": [
    {
      "level": {
        "level": 3,
        "class": { "name": "Fighter" }
      }
    }
  ],
  "consumes": {
    "name": "Soul Point",
    "amount": 1
  },
  "entries": [
    "When you hit a creature with a weapon attack, you can expend one Soul Point to deal an extra {@damage 2d8} necrotic damage."
  ]
}
```

---

## Copy / Inheritance

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_copy</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Inherit all properties from another optional feature and optionally override fields via <code>_mod</code>.
      <pre><code class="language-json">"_copy": { "name": "Agonizing Blast", "source": "PHB" }</code></pre>
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
</div>

---

## Foundry VTT

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryImg</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Icon image path for Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundrySystem</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Override dnd5e system fields in Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryFlags</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Module flag overrides for Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryEffects</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Active effects applied in Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryActivities</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Foundry VTT dnd5e v4+ activity configurations.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryAdvice</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Advice entry rendered for the Foundry importer.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_foundryMerge</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Controls whether Foundry system/flags objects are merged with base values rather than overwritten. E.g. <code>{ "system": true }</code>.</div>
  </div>
</div>

---

## Schema Reference

- `5etools-utils/schema/brew/optionalfeatures.json` — Main schema
- `5etools-utils/schema/brew/util.json` — Shared definitions (prerequisites, proficiencies)
- `5etools-utils/schema/brew/util-additionalspells.json` — Spell granting schema
