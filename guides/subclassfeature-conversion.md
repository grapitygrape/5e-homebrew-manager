# Subclass Features `subclassFeature`

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
  "class": [ ... ],
  "subclass": [ ... ],
  "subclassFeature": [ ... ]
}
```

A subclass feature file needs `class`, `subclass`, and `subclassFeature` arrays. See [class-conversion.md](class-conversion.md) and [subclass-conversion.md](subclass-conversion.md) for parent structures.

## Linking to the Parent Subclass

Subclass features link to their parent subclass via **identifiers**:

- **`className`** (string): Name of the parent class (e.g., "Wizard", "Fighter")
- **`classSource`** (string): Source of the parent class (e.g., "PHB", "MyBrew")
- **`subclassShortName`** (string): Short name of the subclass (e.g., "Abjuration", "Champion"). Must match the subclass's `shortName`.
- **`subclassSource`** (string): Source of the subclass (e.g., "PHB", "TCE")

The subclass's `subclassFeatures` array references each feature using the format:
`"Feature Name|ClassName|ClassSource|SubclassShortName|SubclassSource|Level|Source"`

The `subclassFeature` object must have matching `name`, `className`, `classSource`, `subclassShortName`, `subclassSource`, and `level`.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The feature's display name (e.g. <code>"Arcane Ward"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The feature's own source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>className</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Name of the parent class. Must exactly match the class <code>name</code> (e.g. <code>"Wizard"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>classSource</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source of the parent class. Must exactly match the class <code>source</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>subclassShortName</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Short name of the parent subclass. Must exactly match the subclass's <code>shortName</code> (e.g. <code>"Abjuration"</code>, not <code>"School of Abjuration"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>subclassSource</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source of the parent subclass (e.g. <code>"PHB"</code>, <code>"TCE"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>level</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Class level (1–20) at which this feature is gained. Must match the level in the <code>subclassFeatures</code> reference.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Main description and mechanics — strings and/or entry objects. See <a href="#entry-types">Entry Types</a>.</div>
  </div>
</div>

### Basic

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer | string</span>
    </div>
    <div class="prop-card-val">Page number in the source material.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>header</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Sub-heading depth when multiple features share a level. <code>1</code> = subheading, <code>2</code> = sub-subheading.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>type</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Display style: <code>"inset"</code> (boxed/sidebar) or <code>"item"</code> (list-item).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>isClassFeatureVariant</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Marks an optional replacement for a standard subclass feature (Tasha's-style variant).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>isGainAtNextFeatureLevel</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">If <code>true</code>, the feature is optionally gained at the next <code>gainSubclassFeature</code> level rather than the listed level. Used for flexible subclass progression.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Other sources where this feature appears. Each item is <code>{ source, page }</code>.
      <pre><code class="language-json">"otherSources": [{ "source": "TCE", "page": 41 }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources that reference this feature in bold text.</div>
  </div>
</div>

### Proficiencies

Same structure as class features — see [classfeature-conversion.md](classfeature-conversion.md#property-reference) for the full sub-key hierarchy (<code>choose</code>, <code>any*</code>, custom <code>"name|source"</code> keys, etc.). Each array item is a single grant-set object.

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skillProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Skill proficiencies granted. Valid keys: <span class="schema-enum" data-enum="skillNames"><code>athletics</code>, <code>acrobatics</code>, <code>sleight of hand</code>, <code>stealth</code>, <code>arcana</code>, <code>history</code>, <code>investigation</code>, <code>nature</code>, <code>religion</code>, <code>animal handling</code>, <code>insight</code>, <code>medicine</code>, <code>perception</code>, <code>survival</code>, <code>deception</code>, <code>intimidation</code>, <code>performance</code>, <code>persuasion</code></span>.
      <pre><code class="language-json">"skillProficiencies": [{ "arcana": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>toolProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Tool proficiencies granted. Valid keys: <span class="schema-enum" data-enum="toolNames"><code>artisan's tools</code>, <code>alchemist's supplies</code>, <code>brewer's supplies</code>, <code>calligrapher's supplies</code>, <code>carpenter's tools</code>, <code>cartographer's tools</code>, <code>cobbler's tools</code>, <code>cook's utensils</code>, <code>glassblower's tools</code>, <code>jeweler's tools</code>, <code>leatherworker's tools</code>, <code>mason's tools</code>, <code>painter's supplies</code>, <code>potter's tools</code>, <code>smith's tools</code>, <code>tinker's tools</code>, <code>weaver's tools</code>, <code>woodcarver's tools</code>, <code>disguise kit</code>, <code>forgery kit</code>, <code>gaming set</code>, <code>dragonchess set</code>, <code>dice set</code>, <code>three-dragon ante set</code>, <code>playing card set</code>, <code>herbalism kit</code>, <code>musical instrument</code>, <code>bagpipes</code>, <code>drum</code>, <code>dulcimer</code>, <code>flute</code>, <code>horn</code>, <code>lute</code>, <code>lyre</code>, <code>pan flute</code>, <code>shawm</code>, <code>viol</code>, <code>navigator's tools</code>, <code>thieves' tools</code>, <code>poisoner's kit</code>, <code>vehicles</code>, <code>vehicles (air)</code>, <code>vehicles (land)</code>, <code>vehicles (water)</code>, <code>vehicles (space)</code></span>.
      <pre><code class="language-json">"toolProficiencies": [{ "thieves' tools": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>languageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Language proficiencies granted. Valid keys: <span class="schema-enum" data-enum="languageNames"><code>abyssal</code>, <code>celestial</code>, <code>common</code>, <code>common sign language</code>, <code>deep speech</code>, <code>draconic</code>, <code>infernal</code>, <code>gith</code>, <code>gnomish</code>, <code>goblin</code>, <code>halfling</code>, <code>orc</code>, <code>primordial</code>, <code>aquan</code>, <code>auran</code>, <code>ignan</code>, <code>terran</code>, <code>sylvan</code>, <code>undercommon</code>, <code>dwarvish</code>, <code>elvish</code>, <code>giant</code>, <code>other</code>, <code>druidic</code>, <code>thieves' cant</code></span>.
      <pre><code class="language-json">"languageProficiencies": [{ "elvish": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>armorProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Armor proficiencies. Keys: <code>light</code>, <code>medium</code>, <code>heavy</code>, <code>shield</code>.
      <pre><code class="language-json">"armorProficiencies": [{ "light": true, "medium": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Weapon proficiencies. Keys: <code>simple</code>, <code>martial</code>, <code>firearms</code>, <code>improvised</code>, or <code>choose.fromFilter</code>.
      <pre><code class="language-json">"weaponProficiencies": [{ "martial": true }]</code></pre>
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
      <code>savingThrowProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Saving throw proficiencies. Keys: <code>str</code>, <code>dex</code>, <code>con</code>, <code>int</code>, <code>wis</code>, <code>cha</code>.
      <pre><code class="language-json">"savingThrowProficiencies": [{ "str": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>expertise</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Expertise (double proficiency) on named skills/tools, or <code>anyProficientSkill</code> / <code>anyProficientTool</code>.
      <pre><code class="language-json">"expertise": [{ "arcana": true }]</code></pre>
    </div>
  </div>
</div>

### Resistances & Immunities

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Damage resistances granted (array of damage-type strings, or a <code>choose</code> object). Valid types: <span class="schema-enum" data-enum="damageTypes"><code>"acid"</code>, <code>"bludgeoning"</code>, <code>"cold"</code>, <code>"fire"</code>, <code>"force"</code>, <code>"lightning"</code>, <code>"necrotic"</code>, <code>"piercing"</code>, <code>"poison"</code>, <code>"psychic"</code>, <code>"radiant"</code>, <code>"slashing"</code>, <code>"thunder"</code></span>.
      <pre><code class="language-json">"resist": ["fire", "cold"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>immune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage immunities — same item structure as <code>resist</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage vulnerabilities — same item structure as <code>resist</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Condition immunities granted. Valid values: <span class="schema-enum" data-enum="conditions"><code>"blinded"</code>, <code>"charmed"</code>, <code>"deafened"</code>, <code>"exhaustion"</code>, <code>"frightened"</code>, <code>"grappled"</code>, <code>"incapacitated"</code>, <code>"invisible"</code>, <code>"paralyzed"</code>, <code>"petrified"</code>, <code>"poisoned"</code>, <code>"prone"</code>, <code>"restrained"</code>, <code>"stunned"</code>, <code>"unconscious"</code></span>.
      <pre><code class="language-json">"conditionImmune": ["charmed", "frightened"]</code></pre>
    </div>
  </div>
</div>

### Resources

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>consumes</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Resource this feature expends per use. Sub-keys: <code>name</code>, <code>amount</code> (or <code>amountMin</code>/<code>amountMax</code>).
      <pre><code class="language-json">"consumes": { "name": "Ki Point", "amount": 1 }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Resource pools this feature defines. Item sub-keys: <code>name</code>, <code>type</code>, <code>count</code>, <code>recharge</code>; <code>dicePool</code> also uses <code>number</code> and <code>faces</code>.
      <pre><code class="language-json">"resources": [
  { "name": "Arcane Ward", "type": "pointPool", "count": 4, "recharge": "restLong" }
]</code></pre>
    </div>
  </div>
</div>

### Foundry VTT

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundrySystem</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Foundry VTT system data.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryFlags</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Foundry VTT flags.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryImg</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Foundry icon image path.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryAdvice</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Foundry-specific conversion advice.</div>
  </div>
</div>

---

## Referencing Other Subclass Features

Use `refSubclassFeature` in entries to embed another subclass feature inline:

```json
{
  "type": "refSubclassFeature",
  "subclassFeature": "Chronal Shift|Wizard||Chronurgy|EGW|2"
}
```

Format: `"Feature Name|ClassName|ClassSource|SubclassShortName|SubclassSource|Level"`

---

## Entry Types

Same as class features. See [classfeature-conversion.md](classfeature-conversion.md#entry-types).

---

## subclassFeatures Array Format (in Subclass)

**String format:** `"Feature Name|ClassName|ClassSource|SubclassShortName|SubclassSource|Level|Source"`

| Part              | Description                       | Default if empty       |
| ----------------- | --------------------------------- | ---------------------- |
| Feature Name      | Exact name of the subclassFeature | —                      |
| ClassName         | Parent class name                 | —                      |
| ClassSource       | Class source                      | PHB                    |
| SubclassShortName | Subclass shortName                | —                      |
| SubclassSource    | Subclass source                   | PHB                    |
| Level             | Class level (1–20)                | —                      |
| Source            | Feature source                    | Same as SubclassSource |

**Examples:**

- `"School of Abjuration|Wizard||Abjuration||2"` → School of Abjuration, Wizard/PHB, Abjuration/PHB, level 2, PHB
- `"Chronal Shift|Wizard||Chronurgy|EGW|2"` → Chronal Shift, Wizard/PHB, Chronurgy/EGW, level 2, EGW

**Subclass feature selection placeholder:**

```json
{
  "subclassFeature": "Martial Archetype feature|Fighter||Champion||7",
  "gainSubclassFeature": true
}
```

---

## Complete Examples

### Example 1: Simple Subclass Feature (Abjuration Savant)

A basic subclass feature gained at level 2 with a simple text description.

```json
{
  "name": "Abjuration Savant",
  "source": "PHB",
  "page": 115,
  "className": "Wizard",
  "classSource": "PHB",
  "subclassShortName": "Abjuration",
  "subclassSource": "PHB",
  "level": 2,
  "header": 1,
  "entries": [
    "Beginning when you select this school at 2nd level, the gold and time you must spend to copy an abjuration spell into your spellbook is halved."
  ]
}
```

### Example 2: Subclass Feature with References (School of Abjuration)

A parent feature that embeds `refSubclassFeature` references to sibling features gained at the same level.

```json
{
  "name": "School of Abjuration",
  "source": "PHB",
  "page": 115,
  "className": "Wizard",
  "classSource": "PHB",
  "subclassShortName": "Abjuration",
  "subclassSource": "PHB",
  "level": 2,
  "entries": [
    "The School of Abjuration emphasizes magic that blocks, banishes, and protects.",
    {
      "type": "refSubclassFeature",
      "subclassFeature": "Abjuration Savant|Wizard||Abjuration||2"
    },
    {
      "type": "refSubclassFeature",
      "subclassFeature": "Arcane Ward|Wizard||Abjuration||2"
    }
  ]
}
```

### Example 3: Homebrew Subclass Feature (Arcane Infusion)

A homebrew subclass feature gained at level 3, showing custom sources and header configuration.

```json
{
  "name": "Arcane Infusion",
  "source": "MyBrew",
  "page": 1,
  "className": "Spellblade",
  "classSource": "MyBrew",
  "subclassShortName": "Spellblade",
  "subclassSource": "MyBrew",
  "level": 3,
  "header": 1,
  "entries": [
    "At 3rd level when you choose this path, you learn to infuse your weapon with arcane energy. When you hit a creature with a weapon attack, you can expend a spell slot to deal an extra {@damage 1d6} force damage per level of the spell slot expended."
  ]
}
```

## Validation

Subclass features are validated against `5etools-utils/schema/brew/class/class.json` (subclassFeature definition).

**Required fields:** `name`, `source`, `className`, `classSource`, `subclassShortName`, `subclassSource`, `level`, `entries`.

**Common validation errors:**

- `subclassShortName` not matching any subclass's `shortName`
- `className` or `classSource` not matching the parent class
- Feature not referenced in the subclass's `subclassFeatures` array
- Invalid `refSubclassFeature` format (wrong pipe count or order)

---

## Common Mistakes

1. **Wrong subclassShortName:** Must exactly match the subclass's `shortName` (e.g., "Abjuration" not "School of Abjuration").
2. **Name mismatch:** The `name` in subclassFeature must match the first part of the string in `subclassFeatures`.
3. **Level mismatch:** The `level` in the subclassFeature must match the level in the `subclassFeatures` string.
4. **Wrong refSubclassFeature format:** Use `"Name|ClassName|ClassSource|SubclassShortName|SubclassSource|Level"` (no Source at end for refs).
5. **Using classFeature for subclass features:** Subclass features require `subclassShortName` and `subclassSource`; class features do not.

---

## Copy / Inheritance

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_copy</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Inherit all properties from another subclass feature and optionally override fields via <code>_mod</code>.
      <pre><code class="language-json">"_copy": { "name": "Arcane Ward", "source": "PHB", "className": "Wizard", "classSource": "PHB", "subclassShortName": "Abjuration", "subclassSource": "PHB", "level": 2 }</code></pre>
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
</div>

---

## Schema References

- **Subclass feature schema:** `5etools-utils/schema/brew/class/class.json` (subclassFeature $def)
- **Proficiencies:** `5etools-utils/schema/brew/util.json`
- **Entry types:** `5etools-utils/schema/brew/entry.json`
- **Copy/inheritance:** `5etools-utils/schema/brew/util-copy.json`
