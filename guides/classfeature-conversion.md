# Class Features `classFeature`

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
  "classFeature": [ ... ]
}
```

A class feature file needs both `class` and `classFeature` arrays. See [class-conversion.md](class-conversion.md) for the parent class structure.

## Linking to the Parent Class

Class features link to their parent class via **identifiers**:

- **`className`** (string): Name of the class (e.g., "Fighter", "Wizard")
- **`classSource`** (string): Source of the class (e.g., "PHB", "MyBrew")

The class's `classFeatures` array references each feature using the format:
`"Feature Name|ClassName|ClassSource|Level|Source"`

The `classFeature` object must have matching `name`, `className`, `classSource`, and `level`. The `source` on the classFeature is the feature's own source (often the same as classSource).

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Feature display name (e.g. <code>"Second Wind"</code>). Must match the first part of the class's <code>classFeatures</code> reference string.</div>
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
    <div class="prop-card-val">Parent class name. Must exactly match the parent class <code>name</code> (e.g. <code>"Fighter"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>classSource</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Parent class source. Must exactly match the parent class <code>source</code> (e.g. <code>"PHB"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>level</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Level (1–20) at which this feature is gained. Must match the level in the <code>classFeatures</code> reference.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">The feature's rules text — strings and/or entry objects. See <a href="#entry-types">Entry Types</a>.</div>
  </div>
</div>

### Basic

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer | string</span>
    </div>
    <div class="prop-card-val">Source book page number.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>header</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Sub-heading depth when multiple features share a level.</div>
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
    <div class="prop-card-val">Marks an optional replacement feature (Tasha's-style variant).</div>
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

### Resources

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>consumes</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Declares a resource this feature expends per use. Sub-keys: <code>name</code> (required, should match a <code>resources[].name</code>), <code>amount</code> (fixed cost), or <code>amountMin</code>/<code>amountMax</code> (variable cost).
      <pre><code class="language-json">"consumes": { "name": "Ki Point", "amount": 1 }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Resource pools this feature defines (Ki Points, Superiority Dice, etc.). Item sub-keys: <code>name</code>, <code>type</code> (<code>"pointPool"</code> or <code>"dicePool"</code>), <code>count</code>, <code>recharge</code> (<code>"restShort"</code>, <code>"restLong"</code>, <code>"dawn"</code>, …); <code>dicePool</code> also uses <code>number</code> and <code>faces</code>.
      <pre><code class="language-json">"resources": [
  { "name": "Ki Points", "type": "pointPool", "count": 5, "recharge": "restLong" }
]</code></pre>
      <pre><code class="language-json">"resources": [
  { "name": "Superiority Dice", "type": "dicePool", "count": 4, "number": 1, "faces": 8, "recharge": "restShort" }
]</code></pre>
    </div>
  </div>
</div>

### Proficiencies

Each proficiency array item is a single "grant set" object: every key set to `true` in one object is granted together. Custom/homebrew items use a `"name|source"` key set to `true`.

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skillProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Skill proficiencies granted. Set a skill key to <code>true</code>, or use <code>any</code> (N free picks) or <code>choose.from</code>. Valid keys: <span class="schema-enum" data-enum="skillNames"><code>athletics</code>, <code>acrobatics</code>, <code>sleight of hand</code>, <code>stealth</code>, <code>arcana</code>, <code>history</code>, <code>investigation</code>, <code>nature</code>, <code>religion</code>, <code>animal handling</code>, <code>insight</code>, <code>medicine</code>, <code>perception</code>, <code>survival</code>, <code>deception</code>, <code>intimidation</code>, <code>performance</code>, <code>persuasion</code></span>.
      <pre><code class="language-json">"skillProficiencies": [{ "stealth": true }]</code></pre>
      <pre><code class="language-json">"skillProficiencies": [{ "choose": { "from": ["stealth", "arcana"], "count": 1 } }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>toolProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Tool proficiencies granted. Set a tool key to <code>true</code>, or use <code>any</code>, <code>anyArtisansTool</code>, <code>anyGamingSet</code>, <code>anyMusicalInstrument</code>, or <code>choose.from</code>. Valid keys: <span class="schema-enum" data-enum="toolNames"><code>artisan's tools</code>, <code>alchemist's supplies</code>, <code>brewer's supplies</code>, <code>calligrapher's supplies</code>, <code>carpenter's tools</code>, <code>cartographer's tools</code>, <code>cobbler's tools</code>, <code>cook's utensils</code>, <code>glassblower's tools</code>, <code>jeweler's tools</code>, <code>leatherworker's tools</code>, <code>mason's tools</code>, <code>painter's supplies</code>, <code>potter's tools</code>, <code>smith's tools</code>, <code>tinker's tools</code>, <code>weaver's tools</code>, <code>woodcarver's tools</code>, <code>disguise kit</code>, <code>forgery kit</code>, <code>gaming set</code>, <code>dragonchess set</code>, <code>dice set</code>, <code>three-dragon ante set</code>, <code>playing card set</code>, <code>herbalism kit</code>, <code>musical instrument</code>, <code>bagpipes</code>, <code>drum</code>, <code>dulcimer</code>, <code>flute</code>, <code>horn</code>, <code>lute</code>, <code>lyre</code>, <code>pan flute</code>, <code>shawm</code>, <code>viol</code>, <code>navigator's tools</code>, <code>thieves' tools</code>, <code>poisoner's kit</code>, <code>vehicles</code>, <code>vehicles (air)</code>, <code>vehicles (land)</code>, <code>vehicles (water)</code>, <code>vehicles (space)</code></span>.
      <pre><code class="language-json">"toolProficiencies": [{ "thieves' tools": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>languageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Language proficiencies granted. Set a language key to <code>true</code>, or use <code>any</code>, <code>anyStandard</code>, <code>anyExotic</code>, <code>anyRare</code>, or <code>choose.from</code>. Valid keys: <span class="schema-enum" data-enum="languageNames"><code>abyssal</code>, <code>celestial</code>, <code>common</code>, <code>common sign language</code>, <code>deep speech</code>, <code>draconic</code>, <code>infernal</code>, <code>gith</code>, <code>gnomish</code>, <code>goblin</code>, <code>halfling</code>, <code>orc</code>, <code>primordial</code>, <code>aquan</code>, <code>auran</code>, <code>ignan</code>, <code>terran</code>, <code>sylvan</code>, <code>undercommon</code>, <code>dwarvish</code>, <code>elvish</code>, <code>giant</code>, <code>other</code>, <code>druidic</code>, <code>thieves' cant</code></span>.
      <pre><code class="language-json">"languageProficiencies": [{ "elvish": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>armorProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Armor proficiencies granted. Keys: <code>light</code>, <code>medium</code>, <code>heavy</code>, <code>shield</code>, or a specific <code>"name|source"</code>.
      <pre><code class="language-json">"armorProficiencies": [{ "light": true, "medium": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Weapon proficiencies granted. Keys: <code>simple</code>, <code>martial</code>, <code>firearms</code>, <code>improvised</code>, a specific <code>"name|source"</code>, or <code>choose.fromFilter</code> / <code>all.fromFilter</code> (item filter string).
      <pre><code class="language-json">"weaponProficiencies": [{ "simple": true, "martial": true }]</code></pre>
      <pre><code class="language-json">"weaponProficiencies": [{ "choose": { "fromFilter": "type=martial weapon", "count": 1 } }]</code></pre>
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
      Saving throw proficiencies granted. Keys: <code>str</code>, <code>dex</code>, <code>con</code>, <code>int</code>, <code>wis</code>, <code>cha</code>, or <code>choose.from</code>.
      <pre><code class="language-json">"savingThrowProficiencies": [{ "dex": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>expertise</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Grants double proficiency bonus on named skills/tools (must already be proficient). Set a key to <code>true</code>, or use <code>anyProficientSkill</code> / <code>anyProficientTool</code>. Valid keys: <span class="schema-enum" data-enum="skillNames"><code>athletics</code>, <code>acrobatics</code>, <code>sleight of hand</code>, <code>stealth</code>, <code>arcana</code>, <code>history</code>, <code>investigation</code>, <code>nature</code>, <code>religion</code>, <code>animal handling</code>, <code>insight</code>, <code>medicine</code>, <code>perception</code>, <code>survival</code>, <code>deception</code>, <code>intimidation</code>, <code>performance</code>, <code>persuasion</code></span>, <span class="schema-enum" data-enum="expertiseTools"><code>artisan's tools</code>, <code>alchemist's supplies</code>, <code>brewer's supplies</code>, <code>calligrapher's supplies</code>, <code>carpenter's tools</code>, <code>cartographer's tools</code>, <code>cobbler's tools</code>, <code>cook's utensils</code>, <code>glassblower's tools</code>, <code>jeweler's tools</code>, <code>leatherworker's tools</code>, <code>mason's tools</code>, <code>painter's supplies</code>, <code>potter's tools</code>, <code>smith's tools</code>, <code>tinker's tools</code>, <code>weaver's tools</code>, <code>woodcarver's tools</code>, <code>disguise kit</code>, <code>forgery kit</code>, <code>gaming set</code>, <code>dragonchess set</code>, <code>dice set</code>, <code>three-dragon ante set</code>, <code>playing card set</code>, <code>herbalism kit</code>, <code>musical instrument</code>, <code>bagpipes</code>, <code>drum</code>, <code>dulcimer</code>, <code>flute</code>, <code>horn</code>, <code>lute</code>, <code>lyre</code>, <code>pan flute</code>, <code>shawm</code>, <code>viol</code>, <code>navigator's tools</code>, <code>thieves' tools</code>, <code>vehicles</code>, <code>vehicles (air)</code>, <code>vehicles (land)</code>, <code>vehicles (water)</code>, <code>vehicles (space)</code>, <code>poisoner's kit</code></span>.
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
      Damage resistances granted. List damage types directly, or a <code>choose.from</code> object. Valid types: <span class="schema-enum" data-enum="damageTypes"><code>"acid"</code>, <code>"bludgeoning"</code>, <code>"cold"</code>, <code>"fire"</code>, <code>"force"</code>, <code>"lightning"</code>, <code>"necrotic"</code>, <code>"piercing"</code>, <code>"poison"</code>, <code>"psychic"</code>, <code>"radiant"</code>, <code>"slashing"</code>, <code>"thunder"</code></span>.
      <pre><code class="language-json">"resist": ["fire"]</code></pre>
      <pre><code class="language-json">"resist": [{ "choose": { "from": ["fire", "cold"], "count": 1 } }]</code></pre>
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
      Condition immunities granted. List conditions directly, or a <code>choose.from</code> object. Valid values: <span class="schema-enum" data-enum="conditions"><code>"blinded"</code>, <code>"charmed"</code>, <code>"deafened"</code>, <code>"exhaustion"</code>, <code>"frightened"</code>, <code>"grappled"</code>, <code>"incapacitated"</code>, <code>"invisible"</code>, <code>"paralyzed"</code>, <code>"petrified"</code>, <code>"poisoned"</code>, <code>"prone"</code>, <code>"restrained"</code>, <code>"stunned"</code>, <code>"unconscious"</code></span>.
      <pre><code class="language-json">"conditionImmune": ["frightened", "charmed"]</code></pre>
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
    <div class="prop-card-val">Foundry VTT system data overrides.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryFlags</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Foundry VTT module flag overrides.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryImg</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Foundry VTT image path.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryAdvice</code>
      <span class="prop-type">entry</span>
    </div>
    <div class="prop-card-val">Guidance entry shown in Foundry.</div>
  </div>
</div>

---

## Entry Types

Entries use the standard entry system. Common types:

### Plain Text

```json
"entries": ["Simple paragraph of text."]
```

### Entries Container

```json
{
  "type": "entries",
  "name": "Section Title",
  "entries": ["Content here."]
}
```

### List

```json
{
  "type": "list",
  "items": ["First item.", "Second item."]
}
```

### Choices Inside a Feature

Official data uses two layouts for a feature that offers named choices.

**Short named options**, described in a line or a paragraph each (a list of modes, a list of benefits to pick from): a `list-hang-notitle` list of named items, inside the feature.

```json
{
  "type": "list",
  "style": "list-hang-notitle",
  "items": [
    {
      "type": "item",
      "name": "Force Demolisher",
      "entries": [
        "An arcane wrecking ball or sledgehammer projects from your armor."
      ]
    },
    {
      "type": "item",
      "name": "Giant Stature",
      "entries": ["Your armor grows, making you Large."]
    }
  ]
}
```

**Options that are features in their own right** (several paragraphs each, or choices that later features refer to by name, like Totem Spirit's Bear and Eagle): define each option as its own `classFeature` (or `subclassFeature`) at the same level, and embed them with an `options` block. `count` is how many the player picks. The option features are not listed in the class's `classFeatures` array; the parent's references place them.

```json
{
  "type": "options",
  "count": 1,
  "entries": [
    {
      "type": "refSubclassFeature",
      "subclassFeature": "Bear|Barbarian||Totem Warrior||3"
    },
    {
      "type": "refSubclassFeature",
      "subclassFeature": "Eagle|Barbarian||Totem Warrior||3"
    }
  ]
}
```

Use `refClassFeature` (`"Name|ClassName|ClassSource|Level"`) for class features. Pick between the two layouts by length: when the options are sentences, use the list.

### Inline Tags

Use `{@tag}` for cross-references:

- `{@spell fireball|PHB}` – spell
- `{@condition frightened}` – condition
- `{@skill Stealth}` – skill
- `{@damage 2d6}` – damage dice
- `{@dice 1d20}` – dice roll
- `{@dc 15}` – DC
- `{@class Fighter|PHB}` – class

Fixed damage with no dice ("takes 1 lightning damage") stays plain text; `{@damage}` is only for dice expressions.

---

## classFeatures Array Format (in Class)

The class references class features with strings or objects:

**Simple string:** `"Feature Name|ClassName|ClassSource|Level|Source"`

| Part         | Description                    | Default if empty    |
| ------------ | ------------------------------ | ------------------- |
| Feature Name | Exact name of the classFeature | —                   |
| ClassName    | Parent class name              | —                   |
| ClassSource  | Class source                   | PHB                 |
| Level        | Class level (1–20)             | —                   |
| Source       | Feature source                 | Same as ClassSource |

**Examples:**

- `"Fighting Style|Fighter||1"` → Fighting Style, Fighter, PHB, level 1, PHB
- `"Martial Versatility|Fighter||4|TCE"` → Martial Versatility, Fighter, PHB, level 4, TCE
- `"Spellcasting|Wizard|PHB|1|PHB"` → Spellcasting, Wizard, PHB, level 1, PHB

**Subclass selection placeholder:**

```json
{
  "classFeature": "Martial Archetype|Fighter||3",
  "gainSubclassFeature": true
}
```

The referenced "Martial Archetype" feature typically has minimal or no content; it marks the level where the player chooses a subclass.

---

## Complete Examples

### Example 1: Simple Class Feature (Second Wind)

A standard class feature gained at level 1 with a simple text description and dice tags.

```json
{
  "name": "Second Wind",
  "source": "PHB",
  "page": 72,
  "className": "Fighter",
  "classSource": "PHB",
  "level": 1,
  "entries": [
    "You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to {@dice 1d10 + your fighter level}.",
    "Once you use this feature, you must finish a short or long rest before you can use it again."
  ]
}
```

### Example 2: Class Feature with Header (Spellcasting)

A multi-part class feature that utilizes subheadings to break down complex spellcasting rules.

```json
{
  "name": "Spellcasting",
  "source": "PHB",
  "page": 112,
  "className": "Wizard",
  "classSource": "PHB",
  "level": 1,
  "header": 1,
  "entries": [
    "As a student of arcane magic, you have a spellbook containing spells that show the first glimmerings of your true power.",
    {
      "type": "entries",
      "name": "Cantrips",
      "entries": [
        "At 1st level, you know three cantrips of your choice from the wizard spell list."
      ]
    }
  ]
}
```

### Example 3: Class Feature with Proficiencies and Resources (Spellblade Strike)

A homebrew class feature that grants skill expertise and tracks resource consumption.

```json
{
  "name": "Spellblade Strike",
  "source": "MyBrew",
  "page": 1,
  "className": "Spellblade",
  "classSource": "MyBrew",
  "level": 1,
  "expertise": [{ "arcana": true }],
  "resources": [
    {
      "name": "Spellblade Charge",
      "type": "pointPool",
      "count": 3,
      "recharge": "restShort"
    }
  ],
  "consumes": {
    "name": "Spellblade Charge",
    "amount": 1
  },
  "entries": [
    "When you hit a creature with a weapon attack, you can expend one Spellblade Charge to deal an extra {@damage 1d8} force damage."
  ]
}
```

## Validation

Class features are validated against `5etools-utils/schema/brew/class/class.json` (classFeature definition).

**Required fields:** `name`, `source`, `className`, `classSource`, `level`, `entries`.

**Common validation errors:**

- `className` or `classSource` not matching any class in the file or dependencies
- Feature not referenced in the class's `classFeatures` array
- Invalid entry structure (e.g., wrong type values)
- Proficiency keys not matching schema (e.g., wrong skill/tool names)

---

## Common Mistakes

1. **Wrong parent identifiers:** `className` and `classSource` must exactly match the parent class.
2. **Name mismatch:** The `name` in the classFeature must match the first part of the string in `classFeatures`.
3. **Level mismatch:** The `level` in the classFeature must match the level in the `classFeatures` string.
4. **Using subclassFeature fields:** Class features do NOT have `subclassShortName` or `subclassSource`; those are for subclassFeature only.
5. **Missing entries:** Every classFeature must have an `entries` array with at least one item.
6. **Wrong resist/immune format:** Use `"resist": ["fire"]` (array of strings) — not `[{"resist": ["fire"]}]` (the monster stat block format).
