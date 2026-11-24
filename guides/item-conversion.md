# Items `item`

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
  "item": [ ... ]
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
    <div class="prop-card-val">The item's display name.</div>
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
      <code>rarity</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Item rarity. Use <code>"none"</code> for mundane items.
      <ul>
        <li><code>"none"</code> — Mundane</li>
        <li><code>"common"</code>, <code>"uncommon"</code>, <code>"rare"</code>, <code>"very rare"</code>, <code>"legendary"</code>, <code>"artifact"</code></li>
        <li><code>"varies"</code> — For generic variants</li>
        <li><code>"unknown"</code>, <code>"unknown (magic)"</code></li>
      </ul>
    </div>
  </div>
</div>

### Basic

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>type</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Item category code. Common values:
      <ul>
        <li><code>"G"</code> — Adventuring Gear</li>
        <li><code>"LA"</code> — Light Armor</li>
        <li><code>"MA"</code> — Medium Armor</li>
        <li><code>"HA"</code> — Heavy Armor</li>
        <li><code>"S"</code> — Shield</li>
        <li><code>"M"</code> — Melee Weapon</li>
        <li><code>"R"</code> — Ranged Weapon</li>
        <li><code>"P"</code> — Potion</li>
        <li><code>"SC"</code> — Scroll</li>
        <li><code>"RG"</code> — Ring</li>
        <li><code>"RD"</code> — Rod</li>
        <li><code>"WD"</code> — Wand</li>
        <li><code>"SCF"</code> — Spellcasting Focus</li>
        <li><code>"FD"</code> — Food/Drink</li>
        <li><code>"A"</code> — Ammunition</li>
        <li><code>"OTH"</code> — Other</li>
      </ul>
    </div>
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
      <code>value</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">
      Cost in copper pieces. 1 gp = 100 cp, 1 sp = 10 cp.
      <pre><code class="language-json">"value": 5000</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weight</code>
      <span class="prop-type">number</span>
    </div>
    <div class="prop-card-val">Weight in pounds.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Description text. Can include plain strings and entry objects.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>wondrous</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the item is a wondrous item.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>curse</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the item is cursed.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>sentient</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the item is sentient.</div>
  </div>
</div>

### Armor

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ac</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Base Armor Class provided by the armor or shield.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>acSpecial</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Text describing custom or special AC rules.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>strength</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Minimum Strength requirement to wear the armor without a speed penalty.
      <pre><code class="language-json">"strength": "15"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>stealth</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the armor imposes disadvantage on Dexterity (Stealth) checks.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dexterityMax</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Maximum Dexterity modifier bonus allowed (e.g. <code>2</code> for medium armor).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>baseItem</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Base mundane item UID this item is a magical variant of.
      <pre><code class="language-json">"baseItem": "breastplate|phb"</code></pre>
    </div>
  </div>
</div>

### Focus, Packs, and Containers

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>scfType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Spellcasting focus type: <code>"arcane"</code>, <code>"druid"</code>, <code>"holy"</code>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>focus</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Specific homebrew classes that can use this item as a spellcasting focus.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>miscTags</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Utility tags for filtering: <span class="schema-enum" data-enum="itemMiscTags"><code>"CF/W"</code> Creates Food/Water · <code>"CNS"</code> Consumable · <code>"DRK"</code> Drink · <code>"FOD"</code> Food · <code>"TT"</code> Trinket Table</span>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>packContents</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Items inside a starting equipment pack. Each entry is a bare item UID string, or an object: <code>item</code> (UID, required) with <code>quantity</code> and/or <code>displayName</code> (label shown instead of the item's own name — useful when a pack lists "rations (1 day)" for a generic entry), or <code>special</code> (required) with <code>quantity</code> for things that are not real items. The object forms are closed, and the <code>item</code> form needs at least one key beyond <code>item</code>.
      <pre><code class="language-json">"packContents": [
  { "item": "backpack|phb", "quantity": 1 },
  { "special": "10 pitons" }
]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>atomicPackContents</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the pack must be handled as a single unit, not split into individual items.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>containerCapacity</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Capacity limits for bags or containers. <code>weight</code> (array of max-weight integers), <code>volume</code> (array of cubic feet), <code>weightless</code> (boolean).
      <pre><code class="language-json">"containerCapacity": { "weight": [200], "weightless": true }</code></pre>
    </div>
  </div>
</div>

### Magic Item

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reqAttune</code>
      <span class="prop-type">boolean | string</span>
    </div>
    <div class="prop-card-val">
      Attunement requirement. <code>true</code> for generic attunement, or a string for a condition.
      <pre><code class="language-json">"reqAttune": "by a spellcaster"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>tier</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Magic item tier: <code>"minor"</code> or <code>"major"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>charges</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Maximum charges the item can hold.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>recharge</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      When charges recharge. One of: <span class="schema-enum" data-enum="itemRecharge"><code>"round"</code>, <code>"restShort"</code>, <code>"restLong"</code>, <code>"dawn"</code>, <code>"dusk"</code>, <code>"midnight"</code>, <code>"week"</code>, <code>"month"</code>, <code>"year"</code>, <code>"decade"</code>, <code>"century"</code>, <code>"special"</code></span>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rechargeAmount</code>
      <span class="prop-type">string | integer</span>
    </div>
    <div class="prop-card-val">
      Charges recovered on recharge. Fixed number or dice expression.
      <pre><code class="language-json">"rechargeAmount": "1d6 + 4"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>attachedSpells</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Spells castable from this item. Two forms.
      <p>The <strong>array form</strong> is a plain list of lowercase spell names, treated as the <code>other</code> usage type:</p>
      <pre><code class="language-json">"attachedSpells": ["feather fall", "gust of wind"]</code></pre>
      <p>The <strong>object form</strong> groups spells by how they are cast. At least one group is required, and no other keys are allowed:</p>
      <ul>
        <li><code>will</code>, <code>ritual</code>, <code>other</code> — a flat array of spell names.</li>
        <li><code>rest</code>, <code>daily</code>, <code>limited</code> — an object keyed by uses: <code>"1"</code>, <code>"3"</code>, … for N uses, or <code>"1e"</code>, <code>"3e"</code>, … for N uses <em>each</em>. Values are spell arrays.</li>
        <li><code>charges</code>, <code>resource</code> — the same shape, but keyed only by plain numbers (the charge cost per cast). No <code>e</code> suffix.</li>
        <li><code>resourceName</code> <span class="prop-type">string</span> — what the resource is called, when <code>resource</code> is used.</li>
        <li><code>ability</code> — the spellcasting ability: an abbreviation such as <code>"int"</code>, the string <code>"inherit"</code> to reuse a choice the player already made, or <code>{ "choose": ["int", "wis", "cha"] }</code>.</li>
      </ul>
      <pre><code class="language-json">"attachedSpells": {
  "will": ["light"],
  "daily": { "1e": ["fireball", "lightning bolt"], "3": ["misty step"] },
  "charges": { "2": ["cure wounds"] },
  "ability": { "choose": ["int", "wis", "cha"] }
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellScrollLevel</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Spell level for spell scrolls.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>lootTables</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Random loot tables this item belongs to.
      <pre><code class="language-json">"lootTables": ["Magic Item Table F"]</code></pre>
    </div>
  </div>
</div>

### Stat Modifications

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ability</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Ability score modifications while using or attuned to this item. Three shapes, which can be combined:
      <ul>
        <li>Flat keys — <code>str</code>, <code>dex</code>, <code>con</code>, <code>int</code>, <code>wis</code>, <code>cha</code> — a bonus added to the score.</li>
        <li><code>static</code> — the same six keys, but the score is <em>set</em> to that value rather than increased.</li>
        <li><code>choose</code> — an array of objects with <code>from</code> (required, the abilities on offer), <code>count</code> (how many to pick, default 1) and <code>amount</code> (the bonus each pick gets).</li>
      </ul>
      <pre><code class="language-json">"ability": { "static": { "str": 19 } }</code></pre>
      <pre><code class="language-json">"ability": { "choose": [{ "from": ["str", "con"], "count": 1, "amount": 2 }] }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusAc</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Modifier to Armor Class.
      <pre><code class="language-json">"bonusAc": "+2"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusSpellAttack</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Modifier to spell attack rolls.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusSpellSaveDc</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Modifier to spell save DCs.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusSavingThrow</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Modifier to saving throws.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusAbilityCheck</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Modifier to ability checks.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusProficiencyBonus</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Modifier to proficiency bonus.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage types the item grants resistance to.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>immune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage types the item grants immunity to.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Damage types the item grants vulnerability to. Each element is a damage type string, an object <code>{ "special": "…" }</code> for free text, or a grouped object with <code>vulnerable</code> (required, the damage-type array) plus <code>preNote</code> / <code>note</code> for text before and after the list, and <code>cond</code> <span class="prop-type">true</span> to mark the group as conditional. Explicit <code>null</code> clears an inherited value.
      <pre><code class="language-json">"vulnerable": [{ "preNote": "while attuned,", "vulnerable": ["radiant"], "cond": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Conditions the item grants immunity to.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>modifySpeed</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Speed modifications. Sub-keys are <code>bonus</code> (add), <code>static</code> (overwrite), <code>multiply</code> (scale), and <code>equal</code> (copy another speed). Each takes the movement types <code>walk</code>, <code>burrow</code>, <code>climb</code>, <code>fly</code>, <code>swim</code>, or <code>"*"</code> for all of them; nothing else is accepted.
      <pre><code class="language-json">"modifySpeed": { "bonus": { "*": 10 } }</code></pre>
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
      Embedded flavor text and images, displayed separately from <code>entries</code>. Homebrew-only — site data uses a per-source fluff file instead. Either the inline form below, or a reference form pointing at an <code>itemFluff</code> entry: <code>_itemFluff</code> <span class="prop-type">object</span> (<code>{ "name", "source" }</code>) reuses that entry's fluff wholesale, and <code>_appendItemFluff</code> appends it after this item's own. The two forms cannot be mixed in one object.
      <pre><code class="language-json">"fluff": {
  "entries": ["Forged by the dwarves of Ironhold..."],
  "images": [{ "type": "image", "href": { "type": "internal", "path": "items/shield.webp" } }]
}</code></pre>
    </div>
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
</div>

### Copy / Inheritance

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_copy</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Inherit all properties from another item and optionally override specific fields.
      <pre><code class="language-json">"_copy": { "name": "Longsword", "source": "PHB" }</code></pre>
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
</div>

---

## Examples

### Example 1: Mundane Equipment Pack

A mundane starting equipment item representing a dungeoneer's pack containing multiple sub-items and custom descriptions.

```json
{
  "name": "Dungeoneer's Pack",
  "source": "MyHomebrew",
  "page": 10,
  "type": "G",
  "rarity": "none",
  "value": 1200,
  "weight": 0,
  "packContents": [
    { "item": "backpack|phb", "quantity": 1 },
    { "item": "crowbar|phb", "quantity": 1 },
    { "item": "hammer|phb", "quantity": 1 },
    { "special": "10 pitons" },
    { "item": "tinderbox|phb", "quantity": 1 },
    { "item": "rations (1 day)|phb", "quantity": 10 }
  ],
  "entries": [
    "A pack containing essential equipment for exploring dungeons and ruins."
  ]
}
```

### Example 2: Magic Armor with Attunement

A magical medium breastplate that requires attunement, grants an AC bonus, provides fire resistance, and overrides the wearer's Strength score to 19.

```json
{
  "name": "Armor of the Fire Brand",
  "source": "MyHomebrew",
  "page": 15,
  "baseItem": "breastplate|phb",
  "type": "MA",
  "rarity": "very rare",
  "ac": 14,
  "dexterityMax": 2,
  "reqAttune": "by a fighter or paladin",
  "bonusAc": "+2",
  "resist": ["fire"],
  "ability": { "static": { "str": 19 } },
  "entries": [
    "While wearing this armor, you gain a +2 bonus to AC, resistance to fire damage, and your Strength score becomes 19 if it was not already higher."
  ]
}
```

### Example 3: Magic Container with Speed Modifier

A magical wondrous item representing a weightless storage container that also grants a global speed bonus using the wildcard parameter.

```json
{
  "name": "Pouch of the Swift Voyager",
  "source": "MyHomebrew",
  "page": 20,
  "type": "OTH",
  "rarity": "rare",
  "wondrous": true,
  "reqAttune": true,
  "weight": 1,
  "containerCapacity": {
    "weight": [200],
    "weightless": true
  },
  "modifySpeed": {
    "bonus": { "*": 10 }
  },
  "entries": [
    "This pouch holds up to 200 pounds of items while remaining weightless. While attuned to it, all of your movement speeds are increased by 10 feet."
  ]
}
```

### Weapon

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponCategory</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Weapon proficiency category: <code>"simple"</code>, <code>"martial"</code>, <code>"exotic"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dmg1</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Primary damage dice.
      <pre><code class="language-json">"dmg1": "1d8"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dmg2</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Versatile or secondary damage dice (e.g. <code>"1d10"</code> for a versatile weapon's two-handed damage).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dmgType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Damage type code: <code>"B"</code> bludgeoning, <code>"P"</code> piercing, <code>"S"</code> slashing, <code>"F"</code> fire, <code>"C"</code> cold, <code>"L"</code> lightning, <code>"N"</code> necrotic, <code>"R"</code> radiant, <code>"T"</code> thunder, <code>"O"</code> force, <code>"A"</code> acid, <code>"Y"</code> psychic, <code>"I"</code> poison.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>range</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Throw or ranged attack range as <code>"normal/long"</code>.
      <pre><code class="language-json">"range": "20/60"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reach</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Reach in feet for reach weapons (e.g. <code>10</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>property</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Weapon property codes: <code>"F"</code> finesse, <code>"H"</code> heavy, <code>"L"</code> light, <code>"R"</code> reach, <code>"T"</code> thrown, <code>"2H"</code> two-handed, <code>"V"</code> versatile, <code>"A"</code> ammunition, <code>"AF"</code> ammunition (futuristic), <code>"LD"</code> loading, <code>"S"</code> special, <code>"OTH"</code> other, <code>"RLD"</code> reload, <code>"BF"</code> burst fire.
      <p>Source-qualified codes are also accepted, and some properties exist <em>only</em> in a qualified form: <code>"2H|XPHB"</code>, <code>"A|XPHB"</code>, <code>"F|XPHB"</code>, <code>"H|XPHB"</code>, <code>"L|XPHB"</code>, <code>"LD|XPHB"</code>, <code>"R|XPHB"</code>, <code>"T|XPHB"</code>, <code>"V|XPHB"</code>, <code>"AF|DMG"</code>, <code>"AF|XDMG"</code>, <code>"BF|DMG"</code>, <code>"BF|XDMG"</code>, <code>"RLD|XDMG"</code>, <code>"Vst|EGW"</code> (Vestige of Divergence), and <code>"Evo|AU"</code> (Evolving Item).</p>
      <pre><code class="language-json">"property": ["F", "L"]</code></pre>
      <pre><code class="language-json">"property": ["Evo|AU"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>mastery</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      2024-rules weapon mastery options.
      <pre><code class="language-json">"mastery": ["Topple"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ammoType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">UID of the required ammunition item (e.g. <code>"arrow|phb"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reload</code>
      <span class="prop-type">string | integer</span>
    </div>
    <div class="prop-card-val">Number of shots before the weapon must be reloaded (firearms).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>firearm</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> for firearms (DMG variant rules).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>critThreshold</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Roll value at or above which the weapon scores a critical hit (default 20).</div>
  </div>
</div>

### Weapon Bonuses

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusWeaponAttack</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Modifier to weapon attack rolls (e.g. <code>"+2"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusWeaponDamage</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Modifier to weapon damage rolls.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusWeaponCritDamage</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Extra damage added on critical hits.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusWeapon</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Combined bonus applied to both weapon attack and damage rolls.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusSavingThrowConcentration</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Bonus to concentration saving throws while attuned to this item.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusSpellDamage</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Modifier to spell damage rolls.</div>
  </div>
</div>

### Vehicle / Mount

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>speed</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Speed of the vehicle or mount in feet per round (or as appropriate).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vehHp</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Vehicle hit point maximum.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vehAc</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Vehicle Armor Class.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vehSpeed</code>
      <span class="prop-type">number</span>
    </div>
    <div class="prop-card-val">Vehicle speed in miles per hour.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vehDmgThresh</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Damage threshold — attacks dealing less than this amount deal no damage to the vehicle.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>crew</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Number of crew required to operate the vehicle.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>crewMin</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Minimum crew for a variable-crew vessel.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>crewMax</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Maximum crew for a variable-crew vessel.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>capPassenger</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Passenger capacity.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>capCargo</code>
      <span class="prop-type">number</span>
    </div>
    <div class="prop-card-val">Cargo capacity in tons.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>carryingCapacity</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Load capacity of a mount or beast in pounds.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>travelCost</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Passenger travel cost in copper pieces per mile.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>shippingCost</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Freight shipping cost in copper pieces per 100 lbs per mile.</div>
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
      UIDs of newer reprints.
      Each entry is either a bare UID string, or an object when the reprint needs more than a UID:
      <ul>
        <li><code>uid</code> <span class="prop-type">string</span> (required) — the reprint's UID, e.g. <code>"longsword|xphb"</code>.</li>
        <li><code>tag</code> <span class="prop-type">string</span> — the renderer tag to link through (e.g. <code>"creature"</code>), for when the reprint is a different kind of entity.</li>
        <li><code>edition</code> <span class="prop-type">string</span> — <code>"classic"</code> or <code>"one"</code>, disambiguating a reprint that exists in both rule sets.</li>
      </ul>
      The object form must carry at least one key besides <code>uid</code> — with only a <code>uid</code>, use the bare string instead. No other keys are allowed, and duplicate entries are rejected.
      <pre><code class="language-json">"reprintedAs": ["Longsword|XPHB", { "uid": "Longsword|XPHB", "edition": "one" }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Other books where this item appears.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Additional source books for this item.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources that reference this item (e.g. in bold text).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alCertificateId</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Adventurers League certificate ID (for official AL homebrew).</div>
  </div>
</div>

### Advanced

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alias</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Alternative display names for the item.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>age</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Item age descriptor (e.g. <code>"Renaissance"</code>, <code>"Modern"</code>, <code>"Futuristic"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>typeAlt</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Secondary type code used to give an item a secondary category (e.g. both <code>"SCF"</code> and a weapon type).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>staff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Adds the italicised "Staff" descriptor to the item header line.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>tattoo</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> for magic tattoo items.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>poison</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> for poison items.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>poisonTypes</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Poison delivery types: <code>"contact"</code>, <code>"ingested"</code>, <code>"inhaled"</code>, <code>"injury"</code>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>light</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Light emitted by the item. An array of objects with <code>bright</code> and <code>dim</code> (distances in feet) and <code>shape</code> — either <code>"radius"</code> or <code>"cone"</code>. At least one key per object, no other keys, no duplicate entries. There is no colour field.
      <pre><code class="language-json">"light": [{ "bright": 20, "dim": 20, "shape": "radius" }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>grantsProficiency</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if attuning to or using this item grants proficiency with it.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>grantsLanguage</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the item grants knowledge of a language.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>group</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Group name used to index this item under a broader search term (e.g. <code>"Lycanthrope"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>optionalfeatures</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Optional feature UIDs unlocked by this item (e.g. infusion recipes).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>classFeatures</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Class feature UIDs granted by this item.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>seeAlsoDeck</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Card deck UIDs related to this item, rendered as a "See Also" footnote (e.g. <code>"deck of many things|dmg"</code>). At least one entry if present, and duplicates are rejected.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>seeAlsoVehicle</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Vehicle UIDs associated with this item, rendered as a "See Also" footnote (e.g. <code>"rowboat|gos"</code>). At least one entry if present, and duplicates are rejected.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reqAttuneAlt</code>
      <span class="prop-type">string | boolean</span>
    </div>
    <div class="prop-card-val">Alternate attunement requirement used for filtering.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reqAttuneAltTags</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Tags for the alternate attunement requirement.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reqAttuneTags</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Structured version of <code>reqAttune</code>, driving the attunement filters. An array of objects; keys within one object are ANDed, separate objects are ORed. Supported keys: <code>class</code>, <code>background</code>, <code>race</code>, <code>creatureType</code>, <code>size</code>, <code>alignment</code> (array of alignment codes), <code>languageProficiency</code>, <code>skillProficiency</code>, the six ability minimums <code>str</code> / <code>dex</code> / <code>con</code> / <code>int</code> / <code>wis</code> / <code>cha</code>, and the <code>true</code>-only flags <code>spellcasting</code> and <code>psionics</code>. No duplicate objects.
      <pre><code class="language-json">"reqAttuneTags": [{ "class": "druid" }, { "creatureType": "fey", "wis": 13 }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>valueMult</code>
      <span class="prop-type">number</span>
    </div>
    <div class="prop-card-val">Value multiplier applied when calculating a generic variant's price.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weightMult</code>
      <span class="prop-type">number</span>
    </div>
    <div class="prop-card-val">Weight multiplier applied when calculating a generic variant's weight.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weightNote</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Free-text note displayed alongside the weight (e.g. <code>"when full"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>valueRarity</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Override the rarity used when auto-calculating item value.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>currencyConversion</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">ID of a custom value-conversion table (homebrew only).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>customProperties</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Unrestricted key-value store for custom data not covered by other properties.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalEntries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Extra entries appended after the main <code>entries</code> block.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>detail1</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Free-text field used to complete template entries in generic variants.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>detail2</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Second free-text template-completion field.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>barDimensions</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Physical dimensions of a trade bar, in inches. Keys are <code>l</code> (length), <code>w</code> (width) and <code>h</code> (height) — all three are required, and no others are allowed.
      <pre><code class="language-json">"barDimensions": { "l": 5, "w": 2, "h": 0.5 }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Auto-generated flag — indicates fluff text exists for this item in the fluff data files. Do not set manually.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluffImages</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Auto-generated flag — indicates fluff images exist. Do not set manually.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasRefs</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Auto-generated flag — indicates this item references shared <code>itemEntry</code> definitions. Do not set manually.</div>
  </div>
</div>

### Foundry VTT (Advanced)

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryActivities</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Foundry activity configurations for this item.</div>
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
      <code>foundryType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Manually override the Foundry item type. One of: <span class="schema-enum" data-enum="foundryItemType"><code>"weapon"</code>, <code>"equipment"</code>, <code>"consumable"</code>, <code>"tool"</code>, <code>"loot"</code>, <code>"class"</code>, <code>"spell"</code>, <code>"feat"</code>, <code>"backpack"</code></span>. Use only when the auto-detected type is wrong.</div>
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

## Schema References

- **Item schema:** `5etools-utils/schema/brew/items.json`
- **Item types:** `5etools-utils/schema/brew/items-shared.json` (`#/$defs/itemType`)
