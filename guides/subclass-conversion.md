# Subclasses `subclass`

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

A subclass file typically needs `class`, `subclass`, and `subclassFeature` arrays. See [class-conversion.md](class-conversion.md) for the parent class structure.

## Class–Subclass Relationship

- **Subclass** belongs to a **class** via `className` and `classSource`.
- **className**: Name of the parent class (e.g., "Wizard", "Fighter").
- **classSource**: Source of the parent class (e.g., "PHB", "MyBrew").
- The subclass's `subclassFeatures` array lists subclass features, which are defined in the `subclassFeature` array.
- Each subclassFeature links to this subclass via `className`, `classSource`, `subclassShortName`, and `subclassSource`.

## Subclass Object Properties

### Required Core Properties

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Full subclass name as displayed in the UI (e.g. <code>"School of Abjuration"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>shortName</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Short identifier used in all feature references and links. Must match <code>subclassShortName</code> in every subclassFeature object (e.g. <code>"Abjuration"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must match a <code>_meta.sources</code> entry.</div>
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
    <div class="prop-card-val">Source of the parent class. Must exactly match the class <code>source</code> (e.g. <code>"PHB"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>subclassFeatures</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Feature references for this subclass. Each item is a pipe-delimited string or an object with <code>gainSubclassFeature: true</code>. See <a href="#subclassfeatures-array-format">format below</a>.
      <pre><code class="language-json">"subclassFeatures": [
  "School of Abjuration|Wizard||Abjuration||2",
  "Arcane Ward|Wizard||Abjuration||2",
  "Projected Ward|Wizard||Abjuration||6"
]</code></pre>
    </div>
  </div>
</div>

---

### Optional Core Properties

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source material.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>edition</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Either <code>"one"</code> (2024 rules) or <code>"classic"</code> (2014 rules).
      <pre><code class="language-json">"edition": "classic"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alias</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Alternative names for search.
      <pre><code class="language-json">"alias": ["Abjurer"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Sources this entry has been reprinted as. Prefer over <code>isReprinted</code>.
      <pre><code class="language-json">"reprintedAs": ["Abjuration|Wizard|XPHB|XPHB"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other sources where this subclass appears.</div>
  </div>
</div>

### Spellcasting

Subclasses can add or override spellcasting properties. Structure is identical to class-level spellcasting — see [class-conversion.md](class-conversion.md#spellcasting) for full details.

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>casterProgression</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Spell slot progression type added by this subclass. One of <code>"full"</code>, <code>"1/2"</code>, <code>"1/3"</code>, <code>"pact"</code>, <code>"artificer"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellcastingAbility</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Ability score used for spellcasting. One of: <span class="schema-enum" data-enum="abilityAbbreviations"><code>"str"</code>, <code>"dex"</code>, <code>"con"</code>, <code>"int"</code>, <code>"wis"</code>, <code>"cha"</code></span> (in practice <code>"int"</code>, <code>"wis"</code>, or <code>"cha"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>cantripProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Exactly 20 integers — cantrips known at each level.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>preparedSpells</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Formula for prepared spells.
      <pre><code class="language-json">"preparedSpells": "&lt;$level$&gt; + &lt;$wis_mod$&gt;"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellsKnownProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Exactly 20 integers — spells known at each level.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>preparedSpellsChange</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">When prepared spells can be changed. One of: <code>"restLong"</code> (after a long rest — most 2014 casters), <code>"restShort"</code> (after a short rest), or <code>"level"</code> (only on gaining a level — e.g. 2024 bards, rangers).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>preparedSpellsProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Exactly 20 integers — fixed prepared spell count per level (overrides formula).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellsKnownProgressionFixed</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Spells learned per level that cannot be swapped (Wizard-style). Pair with <code>spellsKnownProgressionFixedAllowLowerLevel</code> if lower-level choices are permitted.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellsKnownProgressionFixedAllowLowerLevel</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Allow choosing lower-level spells when using <code>spellsKnownProgressionFixed</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellsKnownProgressionFixedByLevel</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Map of class level → spell level → count. Used for Warlock Mystic Arcanum-style fixed high-level spell slots.
      <pre><code class="language-json">"spellsKnownProgressionFixedByLevel": {
  "11": { "6": 1 },
  "13": { "7": 1 }
}</code></pre>
    </div>
  </div>
</div>

### Optional Features and Feats

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>optionalfeatureProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Grants optional features at specified levels (e.g. Eldritch Invocations for Warlock subclasses). Same structure as class-level — see <a href="class-conversion.md#optional-features-and-feats">class-conversion.md</a>.
      <pre><code class="language-json">"optionalfeatureProgression": [
  { "name": "Eldritch Invocation", "featureType": ["EI"], "progression": { "2": 2 } }
]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>featProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Grants feats at specified levels (2024 rules). Same structure as class-level.</div>
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
      Spells added to the subclass (e.g. domain spells, patron spells). See <a href="feat-conversion.md#additional-spells-additionalspells">feat-conversion.md</a> for full structure.
      <pre><code class="language-json">"additionalSpells": [{
  "prepared": {
    "2": ["barkskin", "spider climb"],
    "3": ["call lightning", "plant growth"]
  }
}]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>subclassSpells</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Homebrew use only — adds this subclass to spell list indexes, so each spell's page lists it. Does not enable VTT import; use <code>additionalSpells</code> for that.
      <p>A homebrew subclass that grants spells (domain, oath, patron or circle spells) writes <strong>both</strong>: <code>additionalSpells</code> for the grant, and <code>subclassSpells</code> listing the same spells. Official subclasses (like Example 2 below) leave it out, because their spell lists are generated. Each item is a spell UID: <code>"name"</code> for a PHB spell, <code>"name|source"</code> otherwise.</p>
      <pre><code class="language-json">"subclassSpells": ["identify", "heat metal", "arcane ablation|KT-CLL"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>subSubclassSpells</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Homebrew use only — adds sub-subclass entries to spell list indexes (e.g. cleric domains, druid circles). Use <code>additionalSpells</code> alongside this for VTT import.</div>
  </div>
</div>

### Subclass Table Groups

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>subclassTableGroups</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Progression tables specific to this subclass. Item sub-keys: <code>title</code> (table heading), <code>colLabels</code> (column header strings), and <code>rows</code> (data rows, each array matching <code>colLabels</code> length).
      <pre><code class="language-json">"subclassTableGroups": [
  {
    "title": "School of Abjuration",
    "colLabels": ["Wizard Level", "Arcane Ward"],
    "rows": [
      ["2nd", "2 × Wizard level"],
      ["6th", "2 × Wizard level"]
    ]
  }
]</code></pre>
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
      Lore and flavor text for the subclass.
      <pre><code class="language-json">"fluff": {
  "entries": ["The School of Abjuration emphasizes magic that blocks, banishes, or protects."]
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Auto-generated flag — indicates fluff text exists in the fluff data files. Do not set manually.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluffImages</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Auto-generated flag — indicates fluff images exist. Do not set manually.</div>
  </div>
</div>

### Source Attribution

Official **site-data flags** — `srd`, `srd52`, `basicRules`, and `basicRules2024` —
mark inclusion in the SRD or Basic Rules and are never set on homebrew, so they are
intentionally omitted from the property reference.

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>isReprinted</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Legacy flag marking this as reprinted. Prefer <code>reprintedAs</code> where possible.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources that reference this subclass (e.g. in bold text).</div>
  </div>
</div>

### Foundry VTT

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundrySystem</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Foundry system data overrides.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryFlags</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Foundry module flag overrides.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryAdvancement</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Foundry advancement data.</div>
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

### Copy / Inheritance

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_copy</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Inherit all properties from another subclass and optionally apply modifications via <code>_mod</code>. See example below.
      <pre><code class="language-json">"_copy": { "name": "School of Abjuration", "source": "PHB" }</code></pre>
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_versions</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Generates several subclass variants from one definition. Rarely used in homebrew. See the <a href="Spec_Copy.md">Copy spec</a> for both forms — the explicit variant list, and the <code>_abstract</code> / <code>_implementations</code> template form with its <code>_variables</code> substitutions.</div>
  </div>
</div>

The copy below re-homes the PHB Abjuration school onto your own source and swaps its level-2 intro feature for one you define (as a `subclassFeature` with `subclassSource: "MyBrew"`). `shortName` is required even on a copy, and `replaceArr` needs `replace` — the exact array entry being swapped out.

```json
{
  "name": "School of Abjuration",
  "shortName": "Abjuration",
  "source": "MyBrew",
  "className": "Wizard",
  "classSource": "PHB",
  "_copy": {
    "name": "School of Abjuration",
    "shortName": "Abjuration",
    "source": "PHB",
    "className": "Wizard",
    "classSource": "PHB",
    "_mod": {
      "subclassFeatures": {
        "mode": "replaceArr",
        "replace": "School of Abjuration|Wizard||Abjuration||2",
        "items": "School of Abjuration|Wizard||Abjuration|MyBrew|2"
      }
    }
  }
}
```

---

## subclassFeatures Array Format

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

- `"School of Abjuration|Wizard||Abjuration||2"` → School of Abjuration, Wizard/PHB, Abjuration/PHB, level 2
- `"Projected Ward|Wizard||Abjuration||6"` → Projected Ward at level 6
- `"School of Abjuration|Wizard|XPHB|Abjuration||3"` → 2024 version at level 3

---

## Complete Examples

### Example 1: Simple Subclass (Path of the Berserker)

A standard subclass gained at level 3, showing core properties and basic level progression.

```json
{
  "name": "Path of the Berserker",
  "shortName": "Berserker",
  "source": "PHB",
  "page": 49,
  "className": "Barbarian",
  "classSource": "PHB",
  "subclassFeatures": [
    "Path of the Berserker|Barbarian||Berserker||3",
    "Frenzy|Barbarian||Berserker||3",
    "Mindless Rage|Barbarian||Berserker||6",
    "Intimidating Presence|Barbarian||Berserker||10",
    "Retaliation|Barbarian||Berserker||14"
  ]
}
```

### Example 2: Subclass with Additional Spells (Circle of the Land)

A caster subclass that defines domain spells automatically prepared at specific class levels.

```json
{
  "name": "Circle of the Land",
  "shortName": "Land",
  "source": "PHB",
  "page": 68,
  "className": "Druid",
  "classSource": "PHB",
  "additionalSpells": [
    {
      "ability": "wis",
      "prepared": {
        "2": ["barkskin", "spider climb"],
        "3": ["call lightning", "plant growth"],
        "4": ["divination", "freedom of movement"],
        "5": ["commune with nature", "tree stride"]
      }
    }
  ],
  "subclassFeatures": [
    "Circle of the Land|Druid||Land||2",
    "Bonus Cantrip|Druid||Land||2",
    "Natural Recovery|Druid||Land||2",
    "Land's Stride|Druid||Land||6",
    "Nature's Ward|Druid||Land||10",
    "Nature's Sanctuary|Druid||Land||14"
  ]
}
```

### Example 3: Homebrew Subclass (Path of the Spellblade)

A custom homebrew subclass extending a custom homebrew parent class.

```json
{
  "name": "Path of the Spellblade",
  "shortName": "Spellblade",
  "source": "MyBrew",
  "page": 1,
  "className": "Spellblade",
  "classSource": "MyBrew",
  "subclassFeatures": [
    "Path of the Spellblade|Spellblade|MyBrew|Spellblade|MyBrew|3",
    "Arcane Infusion|Spellblade|MyBrew|Spellblade|MyBrew|3",
    "Spell Strike|Spellblade|MyBrew|Spellblade|MyBrew|6",
    "Eldritch Surge|Spellblade|MyBrew|Spellblade|MyBrew|10",
    "Master Spellblade|Spellblade|MyBrew|Spellblade|MyBrew|14"
  ]
}
```

## Validation

Subclasses are validated against `5etools-utils/schema/brew/class/class.json` (subclass definition).

**Required fields:**

- `name`
- `shortName`
- `source`
- `className`
- `classSource`
- `subclassFeatures`

**Common validation errors:**

- `className` or `classSource` not matching any class
- `subclassFeatures` entries that don't match any `subclassFeature` object
- `shortName` not matching `subclassShortName` in subclassFeature objects
- Parent class not present in file or dependencies

---

## Common Mistakes

1. **Wrong shortName:** `shortName` must exactly match `subclassShortName` in all subclassFeature objects.
2. **Mismatched className/classSource:** Must match the parent class the subclass extends.
3. **Wrong subclassFeatures format:** Use `"Name|ClassName|ClassSource|SubclassShortName|SubclassSource|Level|Source"` with pipes.
4. **Missing subclassFeature definitions:** Every entry in `subclassFeatures` must have a corresponding object in the `subclassFeature` array.
5. **Confusing name vs shortName:** `name` is the full display name; `shortName` is the identifier used in all references.

---

## Schema References

- **Inline statblock entries:** Use `{"type": "statblock", "tag": "subclass", ...}` inside an `entries` array to embed a subclass statblock (requires `name`, `shortName`, `source`, `className`, `classSource`).
- **Subclass schema:** `5etools-utils/schema/brew/class/class.json` (subclass $def)
- **Additional spells:** `5etools-utils/schema/brew/util-additionalspells.json`
- **Copy/inheritance:** `5etools-utils/schema/brew/util-copy.json`
- **Entry types:** `5etools-utils/schema/brew/entry.json`
