# Classes `class`

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
  "classFeature": [ ... ],
  "subclassFeature": [ ... ]
}
```

You can include any combination of these arrays. A minimal class-only file needs `class` and `classFeature` arrays.

## Class–Subclass Relationship

- **Class** defines the base character class (Fighter, Wizard, etc.).
- **Subclass** belongs to a class via `className` and `classSource`. Example: "School of Abjuration" is a subclass of "Wizard" (PHB).
- **Class features** are listed in the class's `classFeatures` array and defined in the `classFeature` array. Each classFeature links to its class via `className` and `classSource`.
- **Subclass features** are listed in the subclass's `subclassFeatures` array and defined in the `subclassFeature` array. Each subclassFeature links to its subclass via `className`, `classSource`, `subclassShortName`, and `subclassSource`.

## Class Object Properties

### Required Core Properties

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The class name (e.g. <code>"Fighter"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must match the <code>json</code> field in <code>_meta.sources</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>classFeatures</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Feature references for each class level. Each item is a pipe-delimited string <code>"Name|Class|Source|Level"</code> (empty fields default to PHB) or an object with <code>gainSubclassFeature: true</code> for subclass choice levels.
      <pre><code class="language-json">"classFeatures": [
  "Fighting Style|Fighter||1",
  "Martial Versatility|Fighter||4|TCE",
  {
    "classFeature": "Martial Archetype|Fighter||3",
    "gainSubclassFeature": true
  }
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
      <code>hd</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Hit die. Required for non-copy classes. Sub-keys <code>number</code> and <code>faces</code>.
      <pre><code class="language-json">"hd": {
  "number": 1,
  "faces": 10
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>proficiency</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Saving throw proficiencies. Each item is an ability abbreviation: <code>str</code>, <code>dex</code>, <code>con</code>, <code>int</code>, <code>wis</code>, <code>cha</code>.
      <pre><code class="language-json">"proficiency": ["str", "con"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>primaryAbility</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Primary ability scores (2024 rules). Each object has one ability key set to <code>true</code>.
      <pre><code class="language-json">"primaryAbility": [{ "str": true }, { "dex": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>subclassTitle</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Label shown in the UI for the subclass choice (e.g. "Martial Archetype", "Arcane Tradition").
      <pre><code class="language-json">"subclassTitle": "Martial Archetype"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>includeSubclassesFrom</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Other classes, as <code>"Name|Source"</code> strings, whose subclasses this class may also take. The World of Warcraft classes use it with <code>reskinOf</code>: the Mage reskins the Wizard and takes the Wizard's subclasses. As of 5etools v2.41.0 the site stores this but doesn't act on it yet, so its class page still shows only subclasses whose <code>className</code> names this class.
      <pre><code class="language-json">"includeSubclassesFrom": ["Wizard|XPHB"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alias</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Alternative names used in search.
      <pre><code class="language-json">"alias": ["Warrior"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>classGroup</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Group identifiers this class belongs to (used to group related classes together in the UI).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>isSidekick</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">
      Set to <code>true</code> to mark this as a sidekick class (Tasha's sidekick rules).
      <pre><code class="language-json">"isSidekick": true</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>isHero</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">
      Set to <code>true</code> to mark a hero class, one usually open only to characters starting at level 3 or higher. The class page shows a "Hero Class" note, and the class and its subclasses get a "Hero Class" filter tag.
      <pre><code class="language-json">"isHero": true</code></pre>
    </div>
  </div>
</div>

### Starting Proficiencies

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>startingProficiencies</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Proficiencies granted at 1st level. Sub-keys: <code>armor</code> (category strings or item UIDs), <code>armorProficiencies</code> (structured boolean map), <code>weapons</code> (simple/martial or UIDs), <code>tools</code> (tool names), and <code>skills</code> (use a <code>choose</code> object to let players pick from a list).
      <pre><code class="language-json">"startingProficiencies": {
  "armor": ["light", "medium", "shield"],
  "armorProficiencies": [{ "light": true, "medium": true, "shield": true }],
  "weapons": ["simple", "martial"],
  "tools": ["thieves' tools"],
  "skills": [{ "choose": { "from": ["acrobatics", "athletics", "stealth"], "count": 2 } }]
}</code></pre>
      <p><code>armor</code> accepts standard categories (<code>light</code>, <code>medium</code>, <code>heavy</code>, <code>shield</code>) or specific armor item UIDs such as <code>"studded leather|phb"</code>. For non-standard armor, use the object form <code>{ "proficiency": "item uid", "full": "display text" }</code>.</p>
      <p><code>armorProficiencies</code> is the structured equivalent — an array of objects with boolean keys for each category and/or custom armor UIDs:</p>
      <pre><code class="language-json">"armorProficiencies": [
  { "light": true, "medium": true, "shield": true },
  { "studded leather|phb": true }
]</code></pre>
      <p>The same <code>armor</code> / <code>armorProficiencies</code> sub-keys apply to <code>multiclassing.proficienciesGained</code>.</p>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>itemMasteries</code>
      <span class="prop-type">array | true</span>
    </div>
    <div class="prop-card-val">
      Weapons the class can choose Weapon Mastery properties for. <code>true</code> means "the weapons this class is proficient with", which is how every 2024 class with Weapon Mastery is written. For a narrower list, use the same array shape as <code>weaponProficiencies</code>. Pair it with <code>itemMasteriesProgression</code>.
      <pre><code class="language-json">"itemMasteries": true</code></pre>
      <pre><code class="language-json">"itemMasteries": [{ "simple": true }, { "longsword|xphb": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>itemMasteriesProgression</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      How many weapon masteries the class knows. Keys are class levels as strings, values are the count from that level on. <code>"*"</code> is also accepted, for a count that doesn't change with level. No other keys are allowed.
      <pre><code class="language-json">"itemMasteriesProgression": { "1": 2, "4": 3, "10": 4 }</code></pre>
    </div>
  </div>
</div>

### Starting Equipment

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>startingEquipment</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Equipment options at 1st level. Sub-keys: <code>additionalFromBackground</code> (boolean — whether background equipment is also granted), <code>default</code> (human-readable choice strings), <code>defaultData</code> (structured version of <code>default</code>, mapping choice keys <code>"a"</code>/<code>"b"</code> to item arrays of <code>"name|source"</code> UIDs or <code>equipmentType</code> objects), <code>goldAlternative</code> (gold roll formula), and <code>entries</code> (free-text fallback when equipment can't be expressed as structured choices).
      <pre><code class="language-json">"startingEquipment": {
  "additionalFromBackground": true,
  "default": [
    "(a) chain mail or (b) leather armor",
    "(a) martial weapon and shield or (b) two martial weapons"
  ],
  "defaultData": [
    { "a": ["chain mail|phb"], "b": ["leather armor|phb"] },
    { "a": [{ "equipmentType": "weaponMartial" }, "shield|phb"],
      "b": [{ "equipmentType": "weaponMartial", "quantity": 2 }] }
  ],
  "goldAlternative": "{@dice 5d4 × 10|5d4 × 10|Starting Gold}"
}</code></pre>
    </div>
  </div>
</div>

### Requirements

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>requirements</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Ability score prerequisites to take levels in this class (separate from multiclassing requirements).
      <pre><code class="language-json">"requirements": { "str": 13 }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>requirementsSpecial</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Free-text description of non-ability-score prerequisites (homebrew use).
      <pre><code class="language-json">"requirementsSpecial": "Must have slain a dragon."</code></pre>
    </div>
  </div>
</div>

### Multiclassing

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>multiclassing</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Rules for multiclassing into this class. Sub-keys: <code>requirements</code> (ability score minimums; use an <code>or</code> array for alternatives), <code>proficienciesGained</code> (same structure as <code>startingProficiencies</code>), and <code>entries</code> (descriptive text).
      <pre><code class="language-json">"multiclassing": {
  "requirements": { "or": [{ "str": 13 }, { "dex": 13 }] },
  "proficienciesGained": {
    "armor": ["light", "medium", "shield"],
    "weapons": ["simple", "martial"]
  },
  "entries": ["When you gain a level in a class other than Fighter..."]
}</code></pre>
    </div>
  </div>
</div>

### Spellcasting

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>casterProgression</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Spell slot progression type. One of <code>"full"</code>, <code>"1/2"</code>, <code>"1/3"</code>, <code>"pact"</code>, <code>"artificer"</code>.</div>
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
    <div class="prop-card-val">
      Exactly 20 integers — cantrips known at each level (1–20).
      <pre><code class="language-json">"cantripProgression": [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>preparedSpells</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Formula for prepared spells. Tokens: <code>&lt;$level$&gt;</code>, <code>&lt;$int_mod$&gt;</code>, <code>&lt;$wis_mod$&gt;</code>, etc.
      <pre><code class="language-json">"preparedSpells": "&lt;$level$&gt; + &lt;$int_mod$&gt;"</code></pre>
    </div>
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
      <code>preparedSpellsChange</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">When prepared spells can be changed. One of: <code>"restLong"</code> (after a long rest — most 2014 casters), <code>"restShort"</code> (after a short rest), or <code>"level"</code> (only on gaining a level — e.g. 2024 bards, rangers).</div>
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
      <code>spellsKnownProgressionFixed</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Spells learned per level that cannot be swapped (Wizard-style). Pair with <code>spellsKnownProgressionFixedAllowLowerLevel</code> if lower-level choices are permitted.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellsKnownProgressionFixedByLevel</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Map of class level → spell level → count. Used for Warlock Mystic Arcanum and similar.
      <pre><code class="language-json">"spellsKnownProgressionFixedByLevel": {
  "11": { "6": 1 },
  "13": { "7": 1 }
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellsKnownProgressionFixedAllowLowerLevel</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> to allow choosing spells of a lower level than the maximum when using <code>spellsKnownProgressionFixed</code>.</div>
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
      Grants optional features (Fighting Styles, Eldritch Invocations, etc.) at specified levels. Item sub-keys: <code>name</code> (display name for the group), <code>featureType</code> (codes that qualify; must match <code>featureType</code> on optionalfeature entries), and <code>progression</code> (map of class level → number gained).
      <pre><code class="language-json">"optionalfeatureProgression": [
  { "name": "Fighting Style", "featureType": ["FS:F"], "progression": { "1": 1 } }
]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>featProgression</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Grants feats at specified levels (2024 rules). Item sub-keys: <code>name</code> (group display name), <code>category</code> (feat category codes that qualify), and <code>progression</code> (map of class level → number granted).
      <pre><code class="language-json">"featProgression": [
  { "name": "Epic Boon", "category": ["EB"], "progression": { "19": 1 } }
]</code></pre>
    </div>
  </div>
</div>

### Class Table Groups

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>classTableGroups</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Progression tables shown in the class description (spell slots, features by level, etc.). Item sub-keys: <code>title</code> (table heading), <code>colLabels</code> (column header strings), and <code>rows</code> (data rows, each array matching <code>colLabels</code> length).
      <pre><code class="language-json">"classTableGroups": [
  {
    "title": "The Fighter",
    "colLabels": ["Level", "Proficiency Bonus", "Features"],
    "rows": [
      ["1st", "+2", "Fighting Style, Second Wind"],
      ["2nd", "+2", "Action Surge"]
    ]
  }
]</code></pre>
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
    <div class="prop-card-val">Spells added to the class's spell list. See <a href="feat-conversion.md#additional-spells-additionalspells">feat-conversion.md</a> for the full structure.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>classSpells</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Homebrew use only — adds custom spells to lists indexed by class. Does not enable VTT import; use <code>additionalSpells</code> for that.</div>
  </div>
</div>

### Source Attribution

Official **site-data flags** — `srd`, `srd52`, `basicRules`, and `basicRules2024` —
mark inclusion in the SRD or Basic Rules and are never set on homebrew, so they are
intentionally omitted from the property reference.

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Sources this entry has been reprinted as. Prefer over <code>isReprinted</code>.
      <pre><code class="language-json">"reprintedAs": ["Fighter|XPHB"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reskinOf</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Classes this one reskins, in the same form as <code>reprintedAs</code>. The class page shows "Reskins:" with a link to each. It's usually paired with a <code>_copy</code> of the same class.
      <pre><code class="language-json">"reskinOf": ["Fighter|XPHB"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other sources where this class appears.</div>
  </div>
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
    <div class="prop-card-val">Sources that reference this class (e.g. in bold text).</div>
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
      Lore and flavor text for the class, displayed separately from features. An object with optional <code>entries</code> and <code>images</code> arrays. The old array-of-entries form was removed from the schema and no longer validates.
      <pre><code class="language-json">"fluff": {
  "entries": ["Spellblades weave steel and sorcery into a single discipline."]
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
      Inherit all properties from another class and optionally apply modifications via <code>_mod</code>. See Example 2 below.
      <pre><code class="language-json">"_copy": { "name": "Fighter", "source": "PHB" }</code></pre>
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_versions</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Generates several class variants from one definition. Rarely used in homebrew. See the <a href="Spec_Copy.md">Copy spec</a> for both forms — the explicit variant list, and the <code>_abstract</code> / <code>_implementations</code> template form with its <code>_variables</code> substitutions.</div>
  </div>
</div>

---

## Complete Examples

### Example 1: Standard Martial/Spellcaster Class (Spellblade)

A full hybrid class with its own hit dice, starting proficiencies, equipment options, and class feature references.

```json
{
  "name": "Spellblade",
  "source": "MyBrew",
  "page": 1,
  "hd": { "number": 1, "faces": 10 },
  "proficiency": ["str", "con"],
  "startingProficiencies": {
    "armor": ["light", "medium", "shield"],
    "weapons": ["simple", "martial"],
    "skills": [
      {
        "choose": {
          "from": ["arcana", "athletics", "intimidation", "perception"],
          "count": 2
        }
      }
    ]
  },
  "startingEquipment": {
    "additionalFromBackground": true,
    "default": [
      "(a) chain mail or (b) leather armor",
      "(a) martial weapon and shield or (b) two martial weapons"
    ],
    "defaultData": [
      { "a": ["chain mail|phb"], "b": ["leather armor|phb"] },
      {
        "a": [{ "equipmentType": "weaponMartial" }, "shield|phb"],
        "b": [{ "equipmentType": "weaponMartial", "quantity": 2 }]
      }
    ]
  },
  "multiclassing": {
    "requirements": { "or": [{ "str": 13 }, { "int": 13 }] },
    "proficienciesGained": {
      "armor": ["light", "medium", "shield"],
      "weapons": ["simple", "martial"]
    }
  },
  "classFeatures": [
    "Spellblade Strike|Spellblade|MyBrew|1",
    "Spellcasting|Spellblade|MyBrew|1",
    {
      "classFeature": "Spellblade Path|Spellblade|MyBrew|3",
      "gainSubclassFeature": true
    },
    "Ability Score Improvement|Spellblade|MyBrew|4",
    "Extra Attack|Spellblade|MyBrew|5"
  ],
  "subclassTitle": "Spellblade Path"
}
```

### Example 2: Class Copy and Modify (Alternate Fighter)

Using `_copy` to inherit all base properties of the Fighter class while customizing subclass names and features.

```json
{
  "name": "Alternate Fighter",
  "source": "MyBrew",
  "page": 10,
  "_copy": {
    "name": "Fighter",
    "source": "PHB",
    "_mod": {
      "subclassTitle": {
        "mode": "setProp",
        "value": "Tactical Specialty"
      },
      "classFeatures": {
        "mode": "replaceArr",
        "replace": "Second Wind|Fighter||1",
        "items": "Tactical Breathing|Alternate Fighter|MyBrew|1"
      }
    }
  }
}
```

### Example 3: Modern 2024 Caster Class (Elementalist)

A 2024-style spellcasting class featuring primary ability definitions, preparation formula, and full caster progression.

```json
{
  "name": "Elementalist",
  "source": "MyBrew",
  "page": 15,
  "edition": "one",
  "hd": { "number": 1, "faces": 6 },
  "proficiency": ["con", "cha"],
  "primaryAbility": [{ "cha": true }],
  "casterProgression": "full",
  "spellcastingAbility": "cha",
  "cantripProgression": [
    4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6
  ],
  "preparedSpells": "<$level$> + <$cha_mod$>",
  "classFeatures": [
    "Elemental Attunement|Elementalist|MyBrew|1",
    "Spellcasting|Elementalist|MyBrew|1",
    {
      "classFeature": "Elemental Focus|Elementalist|MyBrew|3",
      "gainSubclassFeature": true
    }
  ],
  "subclassTitle": "Elemental Focus"
}
```

## Validation

Classes are validated against `5etools-utils/schema/brew/class/class.json`.

**Required fields:**

- `name`
- `source`
- `classFeatures`

**Common validation errors:**

- `classFeatures` entries that don't match any `classFeature` object (by name, className, classSource, level, source)
- Missing `hd` for non-copy classes
- Invalid `proficiency` values (must be str, dex, con, int, wis, cha)
- `classTableGroups` with mismatched column/row lengths

---

## Common Mistakes

1. **Wrong classFeatures format:** Use `"Name|ClassName|ClassSource|Level|Source"` with pipe separators. Empty fields use `||`.
2. **Forgetting gainSubclassFeature:** Subclass selection levels need `{ "classFeature": "...", "gainSubclassFeature": true }`.
3. **Mismatched identifiers:** `classFeature` objects must have `className` and `classSource` matching the class.
4. **Missing classFeature definitions:** Every entry in `classFeatures` must have a corresponding object in the `classFeature` array.
5. **Wrong cantripProgression length:** Must be exactly 20 integers (levels 1–20).

---

## Schema References

- **Class schema:** `5etools-utils/schema/brew/class/class.json`
- **Proficiencies:** `5etools-utils/schema/brew/util.json`
- **Additional spells:** `5etools-utils/schema/brew/util-additionalspells.json`
- **Copy/inheritance:** `5etools-utils/schema/brew/util-copy.json`
- **Entry types:** `5etools-utils/schema/brew/entry.json`
