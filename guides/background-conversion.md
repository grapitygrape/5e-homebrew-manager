# Backgrounds `background`

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
  "background": [ ... ]
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
    <div class="prop-card-val">The background's display name.</div>
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
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Main background description. Typically contains a <code>list-hang-notitle</code> list of proficiencies/equipment, followed by the feature entry. See <a href="#entry-types">Entry Types</a> below.</div>
  </div>
</div>

### Basic

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source book.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>edition</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Rules edition. Use <code>"one"</code> for 2024-style backgrounds (ability scores + feat from background). Omit for 2014-style.</div>
  </div>
</div>

### Proficiencies

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skillProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Skill proficiencies granted. Each array item is an object of lowercase skill names set to <code>true</code>, with optional <code>choose</code> / <code>any</code> sub-keys. See the example for fixed, choice, and "any N" forms.
      <pre><code class="language-json">"skillProficiencies": [
  { "persuasion": true, "choose": { "from": ["deception", "insight"], "count": 1 } }
]</code></pre>
      <pre><code class="language-json">"skillProficiencies": [{ "any": 2 }]</code></pre>
      Valid skill keys (lowercase): <span class="schema-enum" data-enum="skillNames"><code>athletics</code>, <code>acrobatics</code>, <code>sleight of hand</code>, <code>stealth</code>, <code>arcana</code>, <code>history</code>, <code>investigation</code>, <code>nature</code>, <code>religion</code>, <code>animal handling</code>, <code>insight</code>, <code>medicine</code>, <code>perception</code>, <code>survival</code>, <code>deception</code>, <code>intimidation</code>, <code>performance</code>, <code>persuasion</code></span>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>toolProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Tool proficiencies granted. Same structure as <code>skillProficiencies</code>; use lowercase tool names. Sub-keys include <code>choose</code> and <code>anyArtisansTool</code>.
      <pre><code class="language-json">"toolProficiencies": [{ "thieves' tools": true }]</code></pre>
      <pre><code class="language-json">"toolProficiencies": [
  { "choose": { "from": ["disguise kit", "forgery kit"], "count": 1 } }
]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>languageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Languages granted. Use lowercase language names, or the <code>anyStandard</code> / <code>anyExotic</code> sub-keys.
      <pre><code class="language-json">"languageProficiencies": [{ "common": true, "elvish": true }]</code></pre>
      <pre><code class="language-json">"languageProficiencies": [{ "anyStandard": 1, "anyExotic": 1 }]</code></pre>
      Valid keys (lowercase): <span class="schema-enum" data-enum="languageNames"><code>abyssal</code>, <code>celestial</code>, <code>common</code>, <code>common sign language</code>, <code>deep speech</code>, <code>draconic</code>, <code>infernal</code>, <code>gith</code>, <code>gnomish</code>, <code>goblin</code>, <code>halfling</code>, <code>orc</code>, <code>primordial</code>, <code>aquan</code>, <code>auran</code>, <code>ignan</code>, <code>terran</code>, <code>sylvan</code>, <code>undercommon</code>, <code>dwarvish</code>, <code>elvish</code>, <code>giant</code>, <code>other</code>, <code>druidic</code>, <code>thieves' cant</code></span>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skillToolLanguageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Flexible choice across skills, tools, or languages, via a <code>choose</code> <strong>array</strong> of <code>{ "from": [...], "count": N }</code> objects, with <code>from</code> entries like <code>anySkill</code>, <code>anyTool</code>, <code>anyLanguage</code>.
      <pre><code class="language-json">"skillToolLanguageProficiencies": [
  { "choose": [{ "from": ["anySkill", "anyTool", "anyLanguage"], "count": 2 }] }
]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Weapon proficiencies (rare for backgrounds).</div>
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
      Armor proficiencies (rare for backgrounds).
      <pre><code class="language-json">"armorProficiencies": [{ "light": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>expertise</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Expertise in skills (rare for backgrounds).
      <pre><code class="language-json">"expertise": [{ "anyProficientSkill": 1 }]</code></pre>
    </div>
  </div>
</div>

### Starting Equipment

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>startingEquipment</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Structured equipment data for VTT import. Uses keyed arrays: <code>"_"</code> for the default list, <code>"A"</code>/<code>"B"</code> etc. for player choices. Item sub-properties include <code>item</code> (UID like <code>"longsword|phb"</code>), <code>quantity</code>, <code>displayName</code>, <code>containsValue</code> (CP in a coin pouch), <code>value</code> (direct CP), and <code>special</code> (custom text). All currency is in copper pieces (1 GP = 100 CP).
      <pre><code class="language-json">"startingEquipment": [
  {
    "_": [
      { "item": "ink (1-ounce bottle)|PHB", "displayName": "a bottle of ink" },
      { "special": "identification papers" },
      { "item": "pouch|phb", "containsValue": 500 }
    ]
  }
]</code></pre>
      <pre><code class="language-json">"startingEquipment": [
  {
    "A": [{ "item": "Forgery Kit|XPHB" }, { "item": "Book|XPHB" }, { "value": 800 }],
    "B": [{ "value": 5000 }]
  }
]</code></pre>
    </div>
  </div>
</div>

### 2024 Rules

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ability</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Ability score improvements granted by the background (2024-style). Use with <code>"edition": "one"</code>. Each item is a <code>choose</code> object, optionally <code>weighted</code>.
      <pre><code class="language-json">"ability": [
  { "choose": { "from": ["str", "dex", "con", "int", "wis", "cha"], "count": 2, "amount": 1 } }
]</code></pre>
      <pre><code class="language-json">"ability": [
  { "choose": { "weighted": { "from": ["int", "wis", "cha"], "weights": [2, 1] } } }
]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>feats</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Feats granted by the background (2024-style). Use with <code>"edition": "one"</code>. Either a feat UID set to <code>true</code>, or an <code>anyFromCategory</code> object.
      <pre><code class="language-json">"feats": [{ "magic initiate|xphb": true }]</code></pre>
      <pre><code class="language-json">"feats": [{ "anyFromCategory": { "category": ["General"], "count": 1 } }]</code></pre>
    </div>
  </div>
</div>

### Spellcasting

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalSpells</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Spellcasting abilities granted. Recharge sub-keys: <code>will</code> (at-will), <code>daily</code> (long rest, keyed by uses), <code>rest</code> (short or long rest), <code>ritual</code>, <code>_</code> (simply known). Spells live under <code>innate</code> or <code>known</code>.
      <pre><code class="language-json">"additionalSpells": [
  {
    "ability": "cha",
    "innate": {
      "1": { "daily": { "1": ["detect magic"] } },
      "3": { "daily": { "1": ["misty step"] } }
    }
  }
]</code></pre>
      <pre><code class="language-json">"additionalSpells": [
  { "ability": "int", "known": { "_": ["prestidigitation", "mage hand"] } }
]</code></pre>
      The full structure — group keys, the character-level vs spell-level distinction, every recharge category, and the uses keys (<code>"2e"</code>, <code>"pb"</code>, <code>"halfPb"</code>, <code>"mod"</code>, …) — is documented once in <a href="additionalspells-reference.md">additionalspells-reference.md</a>. The definition is shared, so that page is authoritative.
    </div>
  </div>
</div>

### Additional

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>fromFeature</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Links other properties to the background's feature entry for VTT display.
      <pre><code class="language-json">"fromFeature": { "toolProficiencies": true, "languageProficiencies": true }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>prerequisite</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Requirements to take this background (rare). Sub-keys include <code>race</code>, <code>level</code>, <code>campaign</code>.
      <pre><code class="language-json">"prerequisite": [{ "race": [{ "name": "Changeling" }] }]</code></pre>
      Every supported key — display keys, class/subclass gating and its visibility flags, proficiency, spellcasting, and the content keys — is documented once in <a href="prerequisite-reference.md">prerequisite-reference.md</a>. The definition is shared, so that page is authoritative for all of them.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage resistances granted (very rare for backgrounds).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>immune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage immunities granted (very rare for backgrounds).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage vulnerabilities granted (very rare for backgrounds).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Condition immunities granted (very rare for backgrounds).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other sources where this background appears.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Links to updated versions of this background.
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
</div>

### Fluff

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>fluff</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Flavor text and images for homebrew. Displayed separately from <code>entries</code>. Sub-keys: <code>entries</code>, <code>images</code>.
      <pre><code class="language-json">"fluff": {
  "entries": ["Your nose leads you places that wise men fear to tread..."],
  "images": [{ "type": "image", "href": { "type": "external", "url": "https://..." } }]
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Flag indicating separate fluff text exists (site data only, not homebrew).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluffImages</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Flag indicating separate fluff images exist (site data only, not homebrew).</div>
  </div>
</div>

### Source Attribution

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other books or sources where this background also appears.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources that reference this background in bold text (e.g. a later book that lists it as an option).</div>
  </div>
</div>

### Foundry VTT

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryImg</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Path to icon for Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundrySystem</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Override system parameters for Foundry VTT.</div>
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
    <div class="prop-card-val">Active status effects applied in Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryActivities</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Foundry activity configurations.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryAdvancement</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Foundry advancement definitions for this background.</div>
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

### Copy / Inheritance

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_copy</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Inherit all properties from another background and optionally modify specific fields via <code>_mod</code>. Modes: <code>insertArr</code> (at index), <code>appendArr</code> (end), <code>prependArr</code> (start), <code>replaceArr</code>, <code>removeArr</code>, <code>replaceTxt</code>, <code>appendStr</code>.
      <pre><code class="language-json">{
  "name": "Acolyte (Extended)",
  "source": "MyHomebrew",
  "_copy": {
    "name": "Acolyte",
    "source": "XPHB",
    "_mod": {
      "entries": {
        "mode": "insertArr",
        "index": 2,
        "items": [{ "name": "Suggested Characteristics", "type": "entries", "entries": ["..."] }]
      }
    }
  }
}</code></pre>
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
</div>

---

## Entry Types

### Standard Background Structure (2014)

```json
"entries": [
  {
    "type": "list",
    "style": "list-hang-notitle",
    "items": [
      { "type": "item", "name": "Skill Proficiencies", "entry": "{@skill Deception}, {@skill Insight}" },
      { "type": "item", "name": "Tool Proficiencies", "entry": "{@item thieves' tools|phb}" },
      { "type": "item", "name": "Languages", "entry": "One of your choice" },
      { "type": "item", "name": "Equipment", "entry": "A {@item disguise kit|phb} and a {@item pouch|phb} containing 15 gp" }
    ]
  },
  {
    "name": "Feature: Feature Name",
    "type": "entries",
    "entries": ["Feature description text..."],
    "data": { "isFeature": true }
  }
]
```

### 2024 Background Structure

```json
"entries": [
  {
    "type": "list",
    "style": "list-hang-notitle",
    "items": [
      { "type": "item", "name": "Ability Scores:", "entry": "Intelligence, Wisdom, Charisma" },
      { "type": "item", "name": "Feat:", "entry": "{@feat Magic Initiate|XPHB} (Cleric)" },
      { "type": "item", "name": "Skill Proficiencies:", "entry": "{@skill Insight|XPHB} and {@skill Religion|XPHB}" },
      { "type": "item", "name": "Tool Proficiency:", "entry": "{@item Calligrapher's Supplies|XPHB}" },
      { "type": "item", "name": "Equipment:", "entry": "Choose A or B: (A) ... or (B) 50 GP" }
    ]
  }
]
```

Background features use `"data": { "isFeature": true }` on the entries object.

### Rollable Tables (Suggested Characteristics)

```json
{
  "type": "table",
  "caption": "Personality Trait",
  "colLabels": ["{@dice d8}", "Personality Trait"],
  "colStyles": ["col-1 text-center", "col-11"],
  "rows": [
    [
      { "type": "cell", "roll": { "exact": 1 } },
      "I idolize a particular hero of my faith..."
    ]
  ]
}
```

## Inline Tags

- **`{@skill Perception}`** — Link to skill
- **`{@item thieves' tools|PHB}`** — Link to item
- **`{@language Elvish}`** — Link to language
- **`{@feat Alert|PHB}`** — Link to feat
- **`{@spell detect magic|PHB}`** — Link to spell
- **`{@background Acolyte|PHB}`** — Link to another background
- **`{@dice d6}`** — Rollable dice

---

## Examples

### Example 1: Legacy Background (2014 Style)

A standard background featuring basic skill, tool, and language proficiencies, along with a custom feature and standard starting equipment.

```json
{
  "name": "Presshound",
  "source": "MyHomebrew",
  "page": 205,
  "entries": [
    {
      "type": "list",
      "style": "list-hang-notitle",
      "items": [
        {
          "type": "item",
          "name": "Skill Proficiencies",
          "entry": "{@skill Persuasion}, {@skill Insight} or {@skill Deception}"
        },
        {
          "type": "item",
          "name": "Tool Proficiencies",
          "entry": "{@item Calligrapher's supplies|phb}"
        },
        { "type": "item", "name": "Languages", "entry": "One of your choice" },
        {
          "type": "item",
          "name": "Equipment",
          "entry": "A bottle of {@item Ink (1-ounce bottle)|PHB|ink}, a pen, a pad of paper, a {@item pouch|phb|bag} containing 5 gp"
        }
      ]
    },
    {
      "name": "Feature: Exclusive Interview",
      "type": "entries",
      "entries": [
        "You are skilled at saying whatever you need to score that interview..."
      ],
      "data": { "isFeature": true }
    }
  ],
  "skillProficiencies": [
    {
      "persuasion": true,
      "choose": { "from": ["deception", "insight"], "count": 1 }
    }
  ],
  "toolProficiencies": [{ "calligrapher's supplies": true }],
  "languageProficiencies": [{ "any": 1 }],
  "startingEquipment": [
    {
      "_": [
        {
          "item": "ink (1-ounce bottle)|PHB",
          "displayName": "a bottle of ink"
        },
        { "special": "a pen" },
        { "special": "a pad of paper" },
        { "item": "pouch|phb", "containsValue": 500 }
      ]
    }
  ],
  "fluff": {
    "entries": ["Your nose leads you places that wise men fear to tread..."]
  }
}
```

### Example 2: 2024 Background (Modern Style)

A modern background featuring weighted ability score choices, a bonus feat, specific proficiencies, and choose-based starting equipment options.

```json
{
  "name": "Agent of Augustine",
  "source": "GrimHollowPG24",
  "page": 107,
  "edition": "one",
  "ability": [
    {
      "choose": {
        "weighted": { "from": ["int", "wis", "cha"], "weights": [2, 1] }
      }
    },
    {
      "choose": {
        "weighted": { "from": ["int", "wis", "cha"], "weights": [1, 1, 1] }
      }
    }
  ],
  "feats": [{ "insightful collector|GrimHollowPG24": true }],
  "skillProficiencies": [{ "history": true, "persuasion": true }],
  "toolProficiencies": [{ "forgery kit": true }],
  "startingEquipment": [
    {
      "A": [
        { "item": "Forgery Kit|XPHB" },
        { "item": "Book|XPHB" },
        { "item": "Magnifying Glass|XPHB" },
        { "item": "Parchment|XPHB", "quantity": 10 },
        { "item": "Robe|XPHB" },
        { "value": 800 }
      ],
      "B": [{ "value": 5000 }]
    }
  ],
  "entries": [
    {
      "type": "list",
      "style": "list-hang-notitle",
      "items": [
        {
          "type": "item",
          "name": "Ability Scores:",
          "entry": "Intelligence, Wisdom, Charisma"
        },
        {
          "type": "item",
          "name": "Feat:",
          "entry": "{@feat Insightful Collector|GrimHollowPG24}"
        },
        {
          "type": "item",
          "name": "Skill Proficiencies:",
          "entry": "{@skill History|XPHB} and {@skill Persuasion|XPHB}"
        },
        {
          "type": "item",
          "name": "Tool Proficiency:",
          "entry": "{@item Forgery Kit|XPHB}"
        },
        {
          "type": "item",
          "name": "Equipment:",
          "entry": "Choose A or B: (A) {@item Forgery Kit|XPHB}, {@item Book|XPHB}, {@item Magnifying Glass|XPHB}, {@item Parchment|XPHB} (10 sheets), {@item Robe|XPHB}, 8 GP; or (B) 50 GP"
        }
      ]
    }
  ],
  "fluff": {
    "entries": [
      "You've used your education and knowledge from working on behalf of the Augustine Trading Company..."
    ]
  }
}
```

### Example 3: Background with Feature Tables

A legacy background containing rollable tables for flavor or characteristics, showing complex formatting, cell rolls, and specialized proficiencies.

```json
{
  "name": "Changeling Traveler",
  "source": "ExploringEberron",
  "page": 205,
  "entries": [
    {
      "type": "list",
      "style": "list-hang-notitle",
      "items": [
        {
          "type": "item",
          "name": "Skill Proficiencies",
          "entry": "{@skill Deception}, {@skill Insight}"
        },
        {
          "type": "item",
          "name": "Tool Proficiencies",
          "entry": "{@item thieves' tools|phb}"
        },
        {
          "type": "item",
          "name": "Languages",
          "entry": "{@language Skin cant|ExploringEberron}"
        },
        {
          "type": "item",
          "name": "Equipment",
          "entry": "A {@item shiftweave|erlw} garment, one trinket, and a belt {@item pouch|phb} containing 5 gp"
        }
      ]
    },
    {
      "name": "Feature: The Right Face for the Job",
      "type": "entries",
      "entries": [
        "Traveler clans use well-established personas to secure shelter and information..."
      ],
      "data": { "isFeature": true }
    },
    {
      "name": "Fledgeling Persona",
      "type": "entries",
      "entries": [
        "Personas are important tools for traveler clans...",
        {
          "type": "table",
          "colLabels": ["{@dice d8}", "Personas"],
          "colStyles": ["col-1 text-center"],
          "rows": [
            [{ "type": "cell", "roll": { "exact": 1 } }, "Traveling merchant"],
            [{ "type": "cell", "roll": { "exact": 2 } }, "Charismatic outlaw"]
          ]
        }
      ]
    }
  ],
  "skillProficiencies": [{ "deception": true, "insight": true }],
  "toolProficiencies": [{ "thieves' tools": true }],
  "languageProficiencies": [{ "other": true }]
}
```

---

## Schema References

- **Background schema:** `5etools-utils/schema/brew/backgrounds.json`
- **Proficiency definitions:** `5etools-utils/schema/brew/util.json`
- **Additional spells:** `5etools-utils/schema/brew/util-additionalspells.json`
- **Copy/inheritance:** `5etools-utils/schema/brew/util-copy.json`
- **Entry types:** `5etools-utils/schema/brew/entry.json`
