# Tools `baseitem` / `item`

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
  "baseitem": [ ... ],
  "item": [ ... ]
}
```

Tools are items with specific `type` codes. See [item-conversion.md](item-conversion.md) for shared item properties. **Pick the array first:**

| Array      | Use for                                                                                                                                                                                                                                                                                   | Example                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `baseitem` | A mundane tool, instrument, or gaming set — the generic version other items build on.                                                                                                                                                                                                     | Leatherworker's Tools, Dragon Chess Set |
| `item`     | A specific named item, usually magic. The [Magic Item Properties](#magic-item-properties) and [Modifications](#modifications) keys (`wondrous`, `reqAttune`, `tier`, `attachedSpells`, `ability`, `modifySpeed`, …) are **only** valid here — the validator rejects them on a `baseitem`. | Lute of the North Wind                  |

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The tool's display name.</div>
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
      Item rarity. Use <code>"none"</code> for mundane tools. One of: <span class="schema-enum" data-enum="itemRarity"><code>"rare"</code>, <code>"uncommon"</code>, <code>"very rare"</code>, <code>"legendary"</code>, <code>"artifact"</code>, <code>"common"</code>, <code>"none"</code>, <code>"unknown"</code>, <code>"unknown (magic)"</code>, <code>"varies"</code></span>.
      <pre><code class="language-json">"rarity": "none"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>type</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Tool category code. Common values:
      <ul>
        <li><code>"AT"</code> — Artisan's Tool</li>
        <li><code>"T"</code> — General Tool / Kit</li>
        <li><code>"GS"</code> — Gaming Set</li>
        <li><code>"INS"</code> — Musical Instrument</li>
        <li><code>"TAH"</code> — Tack and Harness</li>
      </ul>
      <pre><code class="language-json">"type": "AT"</code></pre>
    </div>
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
      <code>weight</code>
      <span class="prop-type">number</span>
    </div>
    <div class="prop-card-val">
      Weight in pounds.
      <pre><code class="language-json">"weight": 5</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>value</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">
      Cost in copper pieces. 1 gp = 100 cp, 1 sp = 10 cp.
      <pre><code class="language-json">"value": 500</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Description text. Can include plain strings and entry objects.
      <pre><code class="language-json">"entries": ["This set of tools includes shears, needles, and thread."]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>wondrous</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">
      Set to <code>true</code> if the tool is a wondrous/magical item.
      <pre><code class="language-json">"wondrous": true</code></pre>
    </div>
  </div>
</div>

### Magic Item Properties

_`item` only — these keys are rejected on a `baseitem`._

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reqAttune</code>
      <span class="prop-type">boolean | string</span>
    </div>
    <div class="prop-card-val">
      Attunement requirement. <code>true</code> for generic attunement, or a string for conditional attunement.
      <pre><code class="language-json">"reqAttune": "by a bard"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>tier</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Magic item tier. <code>"minor"</code> or <code>"major"</code>.
      <pre><code class="language-json">"tier": "minor"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>charges</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">
      Maximum charges the item can hold.
      <pre><code class="language-json">"charges": 10</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>recharge</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      When charges recharge. One of: <span class="schema-enum" data-enum="itemRecharge"><code>"round"</code>, <code>"restShort"</code>, <code>"restLong"</code>, <code>"dawn"</code>, <code>"dusk"</code>, <code>"midnight"</code>, <code>"week"</code>, <code>"month"</code>, <code>"year"</code>, <code>"decade"</code>, <code>"century"</code>, <code>"special"</code></span>.
      <pre><code class="language-json">"recharge": "dawn"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rechargeAmount</code>
      <span class="prop-type">string | integer</span>
    </div>
    <div class="prop-card-val">
      Charges recovered on recharge. Can be a fixed number or a dice expression.
      <pre><code class="language-json">"rechargeAmount": "1d6 + 4"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>attachedSpells</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Spells that can be cast using this tool. Each entry is a lowercase spell name.
      <pre><code class="language-json">"attachedSpells": ["feather fall", "gust of wind"]</code></pre>
    </div>
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

### Modifications

_`item` only — these keys are rejected on a `baseitem`._

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ability</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Ability score modifications granted while using or attuned to this item. Keys are ability abbreviations, values are integers.
      <pre><code class="language-json">"ability": { "static": { "str": 19 } }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>modifySpeed</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Speed modifications. Use <code>"*"</code> as a key to apply a bonus to all movement types, or named movement types (<code>"walk"</code>, <code>"fly"</code>, etc.) for specific speeds.
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
      Embedded flavor text and images, displayed separately from <code>entries</code>.
      <pre><code class="language-json">"fluff": {
  "entries": ["Forged by the dwarves of Ironhold..."],
  "images": [{ "type": "image", "href": { "type": "internal", "path": "items/lute.webp" } }]
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
      Inherit all properties from another item and optionally override specific fields. See <a href="item-conversion.md">item-conversion.md</a> for the full <code>_copy</code> / <code>_mod</code> pattern.
      <pre><code class="language-json">"_copy": { "name": "Lute", "source": "PHB" }</code></pre>
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
</div>

---

## Examples

### Example 1: Mundane Artisan's Tool

A mundane leatherworker's tool set with basic statistics and a description. **Goes in `baseitem`.**

```json
{
  "name": "Leatherworker's Tools",
  "source": "MyHomebrew",
  "page": 1,
  "type": "AT",
  "rarity": "none",
  "weight": 5,
  "value": 500,
  "entries": [
    "This set of tools includes shears, needles, thread, leather punches, and dye for crafting and repairing leather goods."
  ]
}
```

### Example 2: Mundane Gaming Set

A simple gaming set with weight and value. **Goes in `baseitem`.**

```json
{
  "name": "Dragon Chess Set",
  "source": "MyHomebrew",
  "page": 2,
  "type": "GS",
  "rarity": "none",
  "weight": 2,
  "value": 100,
  "entries": [
    "A board game set carved with stylized chess pieces representing dragons and adventurers."
  ]
}
```

### Example 3: Magic Instrument with Speed Modifier

A magical wondrous lute requiring attunement by a bard. Grants spell access and a global movement bonus via the `*` speed wildcard. **Goes in `item`.**

```json
{
  "name": "Lute of the North Wind",
  "source": "MyHomebrew",
  "page": 3,
  "type": "INS",
  "wondrous": true,
  "rarity": "rare",
  "reqAttune": "by a bard",
  "weight": 3,
  "value": 5000,
  "attachedSpells": ["feather fall", "gust of wind"],
  "modifySpeed": {
    "bonus": {
      "*": 10
    }
  },
  "entries": [
    "A magical lute that allows the performer to cast wind spells while attuned. All of your movement speeds are increased by 10 feet while carrying it."
  ]
}
```

---

## Schema References

- **Item schema:** `5etools-utils/schema/brew/items.json`
- **Item types:** `5etools-utils/schema/brew/items-shared.json` (`#/$defs/itemType`)
- **Base item schema:** `5etools-utils/schema/brew/items-base.json`
