# Ancestries `race`

`race` and `subrace` are the source property names (2024 rules call them species).

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
  "race": [ ... ],
  "subrace": [ ... ]
}
```

You can include `race`, `subrace`, or both.

## Ancestry Evolution

| Era                | Style    | Ability Scores   | Key Properties                    |
| ------------------ | -------- | ---------------- | --------------------------------- |
| 2014 PHB           | Legacy   | Fixed (+2/+1)    | `ability`, `age`                  |
| 2020 Tasha's       | Flexible | Customizable     | `lineage: true`                   |
| 2020 Van Richten's | Lineage  | Fully flexible   | `lineage: "VRGR"`                 |
| 2024 PHB           | Species  | Background-based | `edition: "one"`, `creatureTypes` |

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The ancestry's display name.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>).</div>
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
    <div class="prop-card-val">
      Use <code>"one"</code> for 2024-style species. Omit for 2014-style content.
    </div>
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
      <code>soundClip</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Audio clip associated with this ancestry (site data only; not used in homebrew).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>startingEquipment</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Starting equipment granted by the ancestry. Uses the same structure as background <code>startingEquipment</code> (rarely used for ancestries).</div>
  </div>
</div>

### Size

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>size</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Array of size codes. Always use an array, even for a single size. Codes: <span class="schema-enum" data-enum="sizes"><code>"F"</code> Fine · <code>"D"</code> Diminutive · <code>"T"</code> Tiny · <code>"S"</code> Small · <code>"M"</code> Medium · <code>"L"</code> Large · <code>"H"</code> Huge · <code>"G"</code> Gargantuan · <code>"C"</code> Colossal · <code>"V"</code> Varies</span>. Playable races are almost always <code>"S"</code> and/or <code>"M"</code>.
      <pre><code class="language-json">"size": ["M"]</code></pre>
      <pre><code class="language-json">"size": ["S", "M"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>sizeEntry</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      2024-style formatted size entry for display.
      <pre><code class="language-json">"sizeEntry": {
  "type": "item",
  "name": "Size:",
  "entries": ["Medium (about 4-7 feet tall) or Small (about 2-4 feet tall), chosen when you select this species"]
}</code></pre>
    </div>
  </div>
</div>

### Speed

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>speed</code>
      <span class="prop-type">integer | object</span>
    </div>
    <div class="prop-card-val">
      Walking speed or complex movement object.

      <strong>Simple:</strong>
      <pre><code class="language-json">"speed": 30</code></pre>

      <strong>Multiple movement types:</strong>
      <pre><code class="language-json">"speed": { "walk": 30, "fly": 50, "swim": 30 }</code></pre>

      <strong>Fly speed equal to walk speed:</strong>
      <pre><code class="language-json">"speed": { "walk": 30, "fly": true }</code></pre>

      <strong>Conditional flying:</strong>
      <pre><code class="language-json">"speed": {

"walk": 30,
"fly": { "number": 30, "condition": "(can't be wearing medium or heavy armor)" }
}</code></pre>
</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>speedEntry</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      2024-style formatted speed entry for display.
      <pre><code class="language-json">"speedEntry": {
  "type": "item",
  "name": "Speed:",
  "entries": ["30 feet, Fly 30 feet"]
}</code></pre>
    </div>
  </div>
</div>

### Ability Scores

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ability</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Ability score increases. Format varies by era. Abbreviations: <code>str</code>, <code>dex</code>, <code>con</code>, <code>int</code>, <code>wis</code>, <code>cha</code>.

      <strong>Fixed (2014 style):</strong>
      <pre><code class="language-json">"ability": [{ "dex": 2, "wis": 1 }]</code></pre>

      <strong>Player choice:</strong>
      <pre><code class="language-json">"ability": [

{ "choose": { "from": ["str", "dex", "con", "int", "wis", "cha"], "count": 2, "amount": 1 } }
]</code></pre>

      <strong>Weighted choice (flexible ancestries):</strong>
      <pre><code class="language-json">"ability": [

{ "choose": { "weighted": { "from": ["str", "dex", "con", "int", "wis", "cha"], "weights": [2, 1] } } }
]</code></pre>
</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>abilityEntry</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      2024-style formatted ability description.
      <pre><code class="language-json">"abilityEntry": {
  "type": "item",
  "name": "Ability Score Increase:",
  "entries": ["+2 Charisma, +1 Intelligence"]
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>lineage</code>
      <span class="prop-type">boolean | string</span>
    </div>
    <div class="prop-card-val">
      Flexible ability score ancestry flag (post-Tasha's).
      <ul>
        <li><code>true</code> — Filterable as lineage, no special modifications</li>
        <li><code>"VRGR"</code> — Van Richten's style (choose +2/+1 or +1/+1/+1)</li>
        <li><code>"UA1"</code> — UA lineage variant</li>
      </ul>
    </div>
  </div>
</div>

### Creature Type

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>creatureTypes</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Creature type(s) for the ancestry — primarily for 2024 rules.
      <pre><code class="language-json">"creatureTypes": ["humanoid"]</code></pre>
      <pre><code class="language-json">"creatureTypes": [{ "choose": ["humanoid", "fey"] }]</code></pre>
      Valid types: <code>aberration</code>, <code>beast</code>, <code>celestial</code>, <code>construct</code>, <code>dragon</code>, <code>elemental</code>, <code>fey</code>, <code>fiend</code>, <code>giant</code>, <code>humanoid</code>, <code>monstrosity</code>, <code>ooze</code>, <code>plant</code>, <code>undead</code>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>creatureTypesEntry</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">2024-style formatted creature type description.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>creatureTypeTags</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Additional creature-type filter tags beyond those declared in <code>creatureTypes</code>. E.g. <code>["humanoid"]</code> when a shapeshifter also qualifies.</div>
  </div>
</div>

### Vision

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>darkvision</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">
      Darkvision range in feet.
      <pre><code class="language-json">"darkvision": 60</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>blindsight</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Blindsight range in feet.</div>
  </div>
</div>

### Age

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>age</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Age characteristics (primarily 2014-style content).
      <pre><code class="language-json">"age": { "mature": 18, "max": 750 }</code></pre>
    </div>
  </div>
</div>

### Proficiencies

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>languageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Languages the ancestry knows. Use lowercase language names.
      <pre><code class="language-json">"languageProficiencies": [{ "common": true, "any": 1 }]</code></pre>
      Standard: <code>common</code>, <code>dwarvish</code>, <code>elvish</code>, <code>giant</code>, <code>gnomish</code>, <code>goblin</code>, <code>halfling</code>, <code>orc</code>. Exotic: <code>abyssal</code>, <code>celestial</code>, <code>deep speech</code>, <code>draconic</code>, <code>infernal</code>, <code>primordial</code>, <code>sylvan</code>, <code>undercommon</code>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skillProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"skillProficiencies": [
  { "choose": { "from": ["deception", "insight", "intimidation", "persuasion"], "count": 2 } }
]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>toolProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"toolProficiencies": [{ "smith's tools": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      <pre><code class="language-json">"weaponProficiencies": [
  { "longsword|phb": true, "shortsword|phb": true }
]</code></pre>
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
    <div class="prop-card-val">Armor proficiencies (rare for ancestries).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skillToolLanguageProficiencies</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Flexible choice across skills, tools, or languages in a single pool. <code>choose</code> is an <strong>array</strong> of <code>{ "from": [...], "count": N }</code> objects (<code>from</code> needs at least two options); fixed grants such as <code>{ "anySkill": 1, "anyTool": 1 }</code> sit beside <code>choose</code> in the same object.
      <pre><code class="language-json">"skillToolLanguageProficiencies": [
  { "choose": [{ "from": ["anySkill", "anyTool", "anyLanguage"], "count": 1 }] }
]</code></pre>
    </div>
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
</div>

### Damage & Conditions

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Damage resistances.
      <pre><code class="language-json">"resist": ["fire"]</code></pre>
      <pre><code class="language-json">"resist": [{ "choose": { "from": ["acid", "cold", "fire", "lightning", "poison"] } }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>immune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage immunities.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage vulnerabilities.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Condition immunities.</div>
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
      Innate spellcasting granted by the ancestry. Spell format: <code>"spell name"</code> (leveled), <code>"spell name#c"</code> (cantrip), <code>"spell name|SOURCE"</code> (specific source).

      <strong>Simple cantrip:</strong>
      <pre><code class="language-json">"additionalSpells": [

{ "ability": "cha", "known": { "1": ["light#c"] } }
]</code></pre>

      <strong>Leveled innate (by character level):</strong>
      <pre><code class="language-json">"additionalSpells": [

{
"ability": "cha",
"known": { "1": ["thaumaturgy#c"] },
"innate": {
"3": { "daily": { "1": ["hellish rebuke"] } },
"5": { "daily": { "1": ["darkness"] } }
}
}
]</code></pre>

      <strong>Flexible spellcasting ability:</strong>
      <pre><code class="language-json">"additionalSpells": [

{
"ability": { "choose": ["int", "wis", "cha"] },
"innate": { "3": ["gust of wind"] }
}
]</code></pre>
</div>
  </div>
</div>

### Feats & Trait Tags

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>feats</code>
      <span class="prop-type">array</span>
      The full structure — group keys, the character-level vs spell-level distinction, every recharge category, and the uses keys (<code>"2e"</code>, <code>"pb"</code>, <code>"halfPb"</code>, <code>"mod"</code>, …) — is documented once in <a href="additionalspells-reference.md">additionalspells-reference.md</a>. The definition is shared, so that page is authoritative.
    </div>
    <div class="prop-card-val">
      Feats granted by the ancestry (primarily 2024-style).
      <pre><code class="language-json">"feats": [{ "skillful|xphb": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>traitTags</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Filter-only tags for special traits. Use only when a more specific field (<code>darkvision</code>, <code>skillProficiencies</code>, <code>additionalSpells</code>, …) can't express the trait, e.g. a conditional or temporary effect. Allowed values: <span class="schema-enum" data-enum="raceTraitTags"><code>"Skill Proficiency"</code>, <code>"Armor Proficiency"</code>, <code>"Weapon Proficiency"</code>, <code>"Tool Proficiency"</code>, <code>"Language Proficiency"</code>, <code>"Amphibious"</code>, <code>"Improved Resting"</code>, <code>"Magic Resistance"</code>, <code>"Natural Armor"</code>, <code>"Natural Weapon"</code>, <code>"Powerful Build"</code>, <code>"Skill Bonus Dice"</code>, <code>"Sunlight Sensitivity"</code>, <code>"Speed"</code>, <code>"Tool Bonus Dice"</code>, <code>"Damage Resistance"</code>, <code>"Damage Immunity"</code>, <code>"Condition Immunity"</code>, <code>"Dragonmark"</code>, <code>"Monstrous Race"</code>, <code>"NPC Race"</code>, <code>"Uncommon Race"</code></span>. Any other value (including <code>"Darkvision"</code> or <code>"Spellcasting"</code>) is a validation error.
    </div>
  </div>
</div>

### Content & Height/Weight

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Main description containing racial traits. Each trait is typically an entries object.
      <pre><code class="language-json">"entries": [
  {
    "type": "entries",
    "name": "Darkvision",
    "entries": ["You can see in dim light within 60 feet of you as if it were bright light..."]
  }
]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>heightAndWeight</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Random height/weight generation (2014-style).
      <pre><code class="language-json">"heightAndWeight": {
  "baseHeight": 56,
  "heightMod": "2d10",
  "baseWeight": 90,
  "weightMod": "1d4"
}</code></pre>
      <code>baseHeight</code> and <code>baseWeight</code> in inches/pounds; <code>heightMod</code> adds to height; <code>weightMod</code> multiplied by height mod for weight.
    </div>
  </div>
</div>

### Source Attribution

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>legacy</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> to mark content as superseded by a newer version.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      References to newer versions. <pre><code class="language-json">"reprintedAs": ["Elf|XPHB"]</code></pre>
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
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other sources where this ancestry appears.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other books or sources where this ancestry also appears.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources that reference this ancestry in bold text.</div>
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
      Flavor text and images for homebrew.
      <pre><code class="language-json">"fluff": {
  "entries": ["The shadowkin emerged from the Shadowfell..."],
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

---

## Subrace Properties

Subraces are a **separate entity type** — they live in the `subrace` array, not the
`race` array audited above — so their distinguishing keys are documented here as an
example rather than as race property cards.

A subrace requires `name` and `source`, plus a link to its parent race via
`raceName` and `raceSource`. The optional `overwrite` object marks base-race
properties that should be completely replaced rather than merged. Every standard
race property may also be set on a subrace to add to or override the base race.

```json
{
  "name": "Hill Dwarf",
  "source": "MyHomebrew",
  "raceName": "Dwarf",
  "raceSource": "PHB",
  "overwrite": { "ability": true, "speed": true },
  "ability": [{ "con": 2, "wis": 1 }],
  "entries": [
    {
      "type": "entries",
      "name": "Dwarven Toughness",
      "entries": [
        "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level."
      ]
    }
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
      Inherit all properties from another race and optionally modify specific fields.
      <pre><code class="language-json">{
  "name": "Variant Human",
  "source": "MyHomebrew",
  "_copy": {
    "name": "Human",
    "source": "PHB",
    "_mod": {
      "entries": {
        "mode": "appendArr",
        "items": [
          { "type": "entries", "name": "Bonus Feat", "entries": ["You gain one feat of your choice."] }
        ]
      }
    }
  }
}</code></pre>
      <code>_mod</code> modes: <code>insertArr</code>, <code>appendArr</code>, <code>prependArr</code>, <code>replaceArr</code>, <code>removeArr</code>, <code>replaceTxt</code>.
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_versions</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Generates multiple ancestry variants from a single template. Rarely used in homebrew; see the JSON schema for the full spec. See the <a href="Spec_Copy.md">Copy spec</a> for both forms — the explicit variant list, and the <code>_abstract</code> / <code>_implementations</code> template form with its <code>_variables</code> substitutions.</div>
  </div>
</div>

---

## Inline Tags

- **`{@skill Perception}`** — Link to skill
- **`{@condition charmed}`** — Link to condition
- **`{@spell darkness|PHB}`** — Link to spell
- **`{@damage 1d6}`** — Damage dice
- **`{@dc 15}`** — DC value
- **`{@dice 2d4}`** — General dice roll
- **`{@race Elf|PHB}`** — Link to another race
- **`{@sense Darkvision|XPHB}`** — Link to sense (2024)
- **`{@variantrule Resistance|XPHB}`** — Link to variant rule (2024)

---

## Examples

### Example 1: Simple 2014-Style Ancestry

A standard legacy ancestry with fixed ability score increases, standard traits, and innate spellcasting.

```json
{
  "name": "Shadowkin",
  "source": "MyHomebrew",
  "page": 10,
  "size": ["M"],
  "speed": 30,
  "ability": [{ "dex": 2, "cha": 1 }],
  "age": { "mature": 18, "max": 200 },
  "darkvision": 120,
  "languageProficiencies": [{ "common": true, "any": 1 }],
  "skillProficiencies": [{ "stealth": true }],
  "traitTags": ["Sunlight Sensitivity"],
  "entries": [
    {
      "type": "entries",
      "name": "Age",
      "entries": [
        "Shadowkin mature at the same rate as humans but live much longer, up to 200 years."
      ]
    },
    {
      "type": "entries",
      "name": "Size",
      "entries": [
        "Shadowkin are about the same size as humans. Your size is Medium."
      ]
    },
    {
      "type": "entries",
      "name": "Superior Darkvision",
      "entries": ["Your darkvision has a radius of 120 feet."]
    },
    {
      "type": "entries",
      "name": "Sunlight Sensitivity",
      "entries": [
        "You have disadvantage on attack rolls and on Wisdom ({@skill Perception}) checks that rely on sight when you, the target of your attack, or whatever you are trying to perceive is in direct sunlight."
      ]
    },
    {
      "type": "entries",
      "name": "Shadow Stealth",
      "entries": ["You have proficiency in the {@skill Stealth} skill."]
    },
    {
      "type": "entries",
      "name": "Shadow Magic",
      "entries": [
        "You know the {@spell minor illusion} cantrip. When you reach 3rd level, you can cast {@spell disguise self} once with this trait. When you reach 5th level, you can cast {@spell darkness} once with this trait. Charisma is your spellcasting ability for these spells."
      ]
    },
    {
      "type": "entries",
      "name": "Languages",
      "entries": [
        "You can speak, read, and write Common and one other language of your choice."
      ]
    }
  ],
  "additionalSpells": [
    {
      "ability": "cha",
      "known": { "1": ["minor illusion#c"] },
      "innate": {
        "3": { "daily": { "1": ["disguise self"] } },
        "5": { "daily": { "1": ["darkness"] } }
      }
    }
  ]
}
```

### Example 2: 2024-Style Species

A modern species that does not have ability score increases (handled by backgrounds) and uses species-specific tags.

```json
{
  "name": "Starborn",
  "source": "MyHomebrew",
  "page": 20,
  "edition": "one",
  "creatureTypes": ["humanoid"],
  "size": ["S", "M"],
  "speed": 30,
  "darkvision": 60,
  "resist": ["radiant"],
  "sizeEntry": {
    "type": "item",
    "name": "Size:",
    "entries": [
      "Medium (about 4-7 feet tall) or Small (about 2-4 feet tall), chosen when you select this species"
    ]
  },
  "entries": [
    {
      "type": "entries",
      "name": "Celestial Resistance",
      "entries": ["You have {@variantrule Resistance|XPHB} to Radiant damage."]
    },
    {
      "type": "entries",
      "name": "Darkvision",
      "entries": ["You have {@sense Darkvision|XPHB} with a range of 60 feet."]
    },
    {
      "type": "entries",
      "name": "Starlight",
      "entries": [
        "You know the {@spell Light|XPHB} cantrip. Charisma is your spellcasting ability for it."
      ]
    },
    {
      "type": "entries",
      "name": "Stellar Navigation",
      "entries": [
        "Whenever you finish a {@variantrule Long Rest|XPHB}, you know which way is north, and you have {@variantrule Advantage|XPHB} on Wisdom ({@skill Survival|XPHB}) checks to navigate."
      ]
    }
  ],
  "additionalSpells": [{ "ability": "cha", "known": { "1": ["light|xphb#c"] } }]
}
```

### Example 3: Subrace

A subrace definition that links to a parent race and adds custom characteristics.

```json
{
  "name": "Moon Elf",
  "source": "MyHomebrew",
  "page": 25,
  "raceName": "Elf",
  "raceSource": "PHB",
  "ability": [{ "int": 1 }],
  "additionalSpells": [
    { "ability": "int", "known": { "1": ["minor illusion#c"] } }
  ],
  "entries": [
    {
      "type": "entries",
      "name": "Ability Score Increase",
      "entries": ["Your Intelligence score increases by 1."]
    },
    {
      "type": "entries",
      "name": "Moon Magic",
      "entries": [
        "You know the {@spell minor illusion} cantrip. Intelligence is your spellcasting ability for it."
      ]
    },
    {
      "type": "entries",
      "name": "Lunar Blessing",
      "entries": [
        "You have advantage on saving throws against being {@condition frightened}."
      ]
    }
  ]
}
```

---

## Schema References

- **Race schema:** `5etools-utils/schema/brew/races.json`
- **Proficiency definitions:** `5etools-utils/schema/brew/util.json`
- **Additional spells:** `5etools-utils/schema/brew/util-additionalspells.json`
- **Copy/inheritance:** `5etools-utils/schema/brew/util-copy.json`
- **Entry types:** `5etools-utils/schema/brew/entry.json`
