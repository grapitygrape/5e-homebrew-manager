# Feats `feat`

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
  "feat": [ ... ]
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
    <div class="prop-card-val">The feat's display name.</div>
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
    <div class="prop-card-val">Text describing the feat's features and rules. Can include plain strings and entry objects.</div>
  </div>
</div>

### Prerequisites

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>prerequisite</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Array of prerequisite objects. Multiple objects use OR logic (meeting any is enough); properties within one object use AND logic (all must be met). Supported keys: <code>level</code> (integer or object with class), <code>ability</code> (array of score minimums), <code>race</code>, <code>spellcasting</code> (boolean), <code>feat</code> (array of feat UIDs), <code>other</code> (custom text).
      <pre><code class="language-json">"prerequisite": [
  {
    "level": 8,
    "other": "Proficiency with heavy armor"
  }
]</code></pre>
      <pre><code class="language-json">"prerequisite": [
  {
    "ability": [{ "str": 13 }]
  }
]</code></pre>
      Every supported key — display keys, class/subclass gating and its visibility flags, proficiency, spellcasting, and the content keys — is documented once in <a href="prerequisite-reference.md">prerequisite-reference.md</a>. The definition is shared, so that page is authoritative for all of them.
    </div>
  </div>
</div>

### Ability Score Increases

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ability</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Ability score increases granted by the feat. Each object can contain fixed increases (<code>"str": 1</code>), a <code>choose</code> object, a <code>max</code> override, or <code>hidden: true</code> to suppress the automated ASI display.
      <pre><code class="language-json">"ability": [{ "str": 1 }]</code></pre>
      <pre><code class="language-json">"ability": [
  {
    "choose": { "from": ["int", "wis", "cha"], "amount": 1 }
  }
]</code></pre>
    </div>
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
      Skill proficiencies granted. Use skill name (lowercase) as key with <code>true</code>, or a <code>choose</code> object.
      <pre><code class="language-json">"skillProficiencies": [{ "athletics": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>toolProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Tool proficiencies granted. Same structure as <code>skillProficiencies</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Weapon proficiencies granted.
      <pre><code class="language-json">"weaponProficiencies": [{ "simple": true, "martial": true }]</code></pre>
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
    <div class="prop-card-val">Armor proficiencies granted.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>languageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Languages granted. Use language name (lowercase) as key with <code>true</code>, or <code>any: N</code> for a choice.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>expertise</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Double proficiency bonus for a skill or tool.
      <pre><code class="language-json">"expertise": [{ "athletics": true }]</code></pre>
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
      <code>savingThrowProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Saving throw proficiencies granted.
      <pre><code class="language-json">"savingThrowProficiencies": [{ "str": true, "dex": true }]</code></pre>
    </div>
  </div>
</div>

### Additional Spells

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalSpells</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Spellcasting benefits granted by the feat. Each entry object can include <code>ability</code> (spellcasting ability), <code>innate</code> (at-will or daily-limit spells), <code>known</code> (spells added to known list), <code>prepared</code>, and <code>expanded</code> (added to class spell list).
      <pre><code class="language-json">"additionalSpells": [
  {
    "ability": { "choose": ["int", "wis", "cha"] },
    "innate": {
      "_": {
        "_": ["druidcraft#c"],
        "daily": { "1e": ["entangle"] }
      }
    }
  }
]</code></pre>
      The full structure — group keys, the character-level vs spell-level distinction, every recharge category, and the uses keys (<code>"2e"</code>, <code>"pb"</code>, <code>"halfPb"</code>, <code>"mod"</code>, …) — is documented once in <a href="additionalspells-reference.md">additionalspells-reference.md</a>. The definition is shared, so that page is authoritative.
    </div>
  </div>
</div>

### Damage & Condition

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage resistances granted by the feat.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>immune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage immunities granted by the feat.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage vulnerabilities granted by the feat.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Condition immunities granted by the feat.
      <pre><code class="language-json">"conditionImmune": ["frightened"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>senses</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Senses granted by the feat.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusSenses</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Extra senses granted.
      <pre><code class="language-json">"bonusSenses": [{ "darkvision": 60 }]</code></pre>
    </div>
  </div>
</div>

### Advanced

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>category</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Feat category code.
      <ul>
        <li><code>"G"</code> — General</li>
        <li><code>"O"</code> — Origin</li>
        <li><code>"FS"</code> — Fighting Style</li>
        <li><code>"EB"</code> — Epic Boon</li>
      </ul>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>repeatable</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the feat can be taken multiple times.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>repeatableNote</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Description of rules for selecting the feat multiple times.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>repeatableHidden</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the feat is repeatable but that fact should not be displayed in the UI.</div>
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
      <code>alias</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Alternative names for search indexing.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>traitTags</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Filter-only tags for mechanical traits.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other sources containing this feat.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Other names or sources where this feat was reprinted.
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
      <code>additionalSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other books or sources where this feat also appears.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources that reference this feat in bold text.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_versions</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Generates multiple feat variants from a single template. Rarely used in homebrew; see the source schema for the full spec. See the <a href="Spec_Copy.md">Copy spec</a> for both forms — the explicit variant list, and the <code>_abstract</code> / <code>_implementations</code> template form with its <code>_variables</code> substitutions.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>featProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Feats automatically granted in progression.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>optionalfeatureProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Optional features automatically granted in progression.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if separate fluff text exists (site data only).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluffImages</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if separate fluff images exist (site data only).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>fluff</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Embedded flavor text and images for homebrew.</div>
  </div>
</div>

### Foundry VTT

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryImg</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Token image path for Foundry VTT.</div>
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
      Inherit all properties from another feat and optionally modify specific fields via <code>_mod</code>. See the <a href="Spec_Copy.md">Copy spec</a> for full details.
      <pre><code class="language-json">{
  "name": "Great Weapon Master (Extended)",
  "source": "MyHomebrew",
  "_copy": {
    "name": "Great Weapon Master",
    "source": "PHB",
    "_mod": {
      "entries": {
        "mode": "appendArr",
        "items": ["Additional rule text here."]
      }
    }
  }
}</code></pre>
    </div>
  </div>
</div>

---

## Examples

### Example 1: Simple Martial Feat

A simple feat requiring Strength 13, granting +1 Strength, and adding a combat benefit.

```json
{
  "name": "Shield Basher",
  "source": "MyHomebrew",
  "page": 3,
  "prerequisite": [
    {
      "ability": [{ "str": 13 }]
    }
  ],
  "ability": [{ "str": 1 }],
  "entries": [
    "When you take the Attack action on your turn, you can use a bonus action to try to shove a creature within 5 feet of you with your shield."
  ]
}
```

### Example 2: Magic / Spellcasting Feat

A feat that grants a choice of +1 to Intelligence, Wisdom, or Charisma, and teaches a cantrip and a 1st-level spell castable once per day.

```json
{
  "name": "Touched by the Fey",
  "source": "MyHomebrew",
  "page": 6,
  "ability": [
    {
      "choose": {
        "from": ["int", "wis", "cha"],
        "amount": 1
      }
    }
  ],
  "additionalSpells": [
    {
      "ability": { "choose": ["int", "wis", "cha"] },
      "innate": {
        "_": {
          "_": ["druidcraft#c"],
          "daily": { "1e": ["entangle"] }
        }
      }
    }
  ],
  "entries": [
    "You learn the {@spell druidcraft} cantrip and can cast it at-will. You also learn the {@spell entangle} spell, and can cast it once without expending a spell slot. You regain the ability to do so when you finish a long rest."
  ]
}
```

### Example 3: Complex Feat with Multiple Prerequisites

A high-level feat requiring character level 8, heavy armor proficiency, and granting skill expertise, weapon proficiency, and condition resistance.

```json
{
  "name": "Stalwart Defender",
  "source": "MyHomebrew",
  "page": 12,
  "prerequisite": [
    {
      "level": 8,
      "other": "Proficiency with heavy armor"
    }
  ],
  "skillProficiencies": [{ "athletics": true }],
  "expertise": [{ "athletics": true }],
  "weaponProficiencies": [{ "simple": true, "martial": true }],
  "conditionImmune": ["frightened"],
  "entries": [
    "You gain proficiency in the {@skill Athletics} skill. If you are already proficient in it, you gain expertise instead. You also gain proficiency in simple and martial weapons, and you are immune to being {@condition frightened}."
  ]
}
```

---

## Schema Reference

- **Feat schema:** `5etools-utils/schema/brew/feats.json`
- **Proficiency definitions:** `5etools-utils/schema/brew/util.json`
- **Additional spells:** `5etools-utils/schema/brew/util-additionalspells.json`
