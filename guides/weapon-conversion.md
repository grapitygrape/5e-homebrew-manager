# Weapons `baseitem` / `item` / `magicvariant`

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
  "item": [ ... ],
  "magicvariant": [ ... ]
}
```

Weapons are items with weapon `type` codes. See [item-conversion.md](item-conversion.md) for shared item properties. **Pick the array first** — the same weapon fields are valid in more than one, but some are not, and the validator rejects the entry outright:

| Array          | Use for                                                                                                                                                                                                                                                                              | Example                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `baseitem`     | A mundane weapon that other items build on (the thing `baseItem` and magic variants point at). Weapon-family flags such as `sword`, `axe`, `bow` are **only** valid here.                                                                                                            | Bastard Sword, Composite Bow |
| `item`         | A specific named item, usually magic, optionally built on a base weapon via `baseItem`. The [Magic Weapon](#magic-weapon) properties (`baseItem`, `reqAttune`, `tier`, `attachedSpells`, `critThreshold`, `sentient`, `curse`, `ability`, `modifySpeed`, …) are **only** valid here. | Pick of the Astral Plane     |
| `magicvariant` | A generic template applied to every matching base weapon ("+1 Weapon", "Flame Tongue"). See [magicvariant-conversion.md](magicvariant-conversion.md).                                                                                                                                | Flame Tongue                 |

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The weapon's display name.</div>
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
      Item rarity. Use <code>"none"</code> for mundane weapons. One of: <span class="schema-enum" data-enum="itemRarity"><code>"rare"</code>, <code>"uncommon"</code>, <code>"very rare"</code>, <code>"legendary"</code>, <code>"artifact"</code>, <code>"common"</code>, <code>"none"</code>, <code>"unknown"</code>, <code>"unknown (magic)"</code>, <code>"varies"</code></span>.
      <pre><code class="language-json">"rarity": "none"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>type</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Weapon type code. Append <code>|XPHB</code> for 2024 rules versions.
      <ul>
        <li><code>"M"</code> — Melee weapon</li>
        <li><code>"R"</code> — Ranged weapon</li>
        <li><code>"A"</code> — Ammunition</li>
      </ul>
      <pre><code class="language-json">"type": "M"</code></pre>
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
    <div class="prop-card-val">Weight in pounds.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>value</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Cost in copper pieces (1 gp = 100 cp).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponCategory</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      <code>"simple"</code> or <code>"martial"</code>.
      <pre><code class="language-json">"weaponCategory": "martial"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>property</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Weapon property abbreviations. Append <code>|XPHB</code> for 2024 versions.
      <ul>
        <li><code>"2H"</code> Two-Handed · <code>"F"</code> Finesse · <code>"H"</code> Heavy · <code>"L"</code> Light</li>
        <li><code>"LD"</code> Loading · <code>"R"</code> Reach · <code>"S"</code> Special · <code>"T"</code> Thrown</li>
        <li><code>"V"</code> Versatile · <code>"A"</code> Ammunition · <code>"RLD"</code> Reload · <code>"BF"</code> Burst Fire</li>
      </ul>
      <pre><code class="language-json">"property": ["V", "T"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dmg1</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Base damage dice formula.
      <pre><code class="language-json">"dmg1": "1d8"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dmgType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Single-letter damage type code: <code>B</code> Bludgeoning · <code>P</code> Piercing · <code>S</code> Slashing · <code>A</code> Acid · <code>C</code> Cold · <code>F</code> Fire · <code>O</code> Force · <code>L</code> Lightning · <code>N</code> Necrotic · <code>I</code> Poison · <code>Y</code> Psychic · <code>R</code> Radiant · <code>T</code> Thunder.
      <pre><code class="language-json">"dmgType": "S"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Text describing special weapon rules. Can include strings and entry objects.</div>
  </div>
</div>

### Advanced

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>range</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Ranged weapon range as <code>"normal/maximum"</code> in feet.
      <pre><code class="language-json">"range": "30/120"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dmg2</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Two-handed damage dice for versatile weapons.
      <pre><code class="language-json">"dmg2": "1d10"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reach</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Reach range in feet. Default is 5.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reload</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Number of shots allowed before reloading.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ammoType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Ammunition UID this weapon requires.
      <pre><code class="language-json">"ammoType": "arrow|phb"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>firearm</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if this is a firearm.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>age</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Firearm era. <code>"renaissance"</code>, <code>"modern"</code>, or <code>"futuristic"</code>.
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>mastery</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      2024 Weapon Mastery properties (e.g. <code>["Sap|XPHB"]</code>).
      <pre><code class="language-json">"mastery": ["Sap|XPHB"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>critThreshold</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">
      Minimum roll to score a critical hit. Default is 20.
      <pre><code class="language-json">"critThreshold": 19</code></pre>
    </div>
  </div>
</div>

### Magic Weapon

_`item` only — these keys are rejected on a `baseitem`._

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>baseItem</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      The mundane weapon this magic item is based on, as a UID.
      <pre><code class="language-json">"baseItem": "longsword|phb"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusWeapon</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Flat bonus to both attack and damage rolls.
      <pre><code class="language-json">"bonusWeapon": "+2"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusWeaponAttack</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Flat bonus to attack rolls only.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusWeaponDamage</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Flat bonus to damage rolls only.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonusWeaponCritDamage</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Extra damage added on a critical hit.
      <pre><code class="language-json">"bonusWeaponCritDamage": "+1d6"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reqAttune</code>
      <span class="prop-type">boolean | string</span>
    </div>
    <div class="prop-card-val">
      Attunement requirement. <code>true</code> for generic, or a string for conditional.
      <pre><code class="language-json">"reqAttune": "by a spellcaster"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>tier</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val"><code>"minor"</code> or <code>"major"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>charges</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Maximum charges the weapon can hold.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>recharge</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">When charges recharge. One of: <span class="schema-enum" data-enum="itemRecharge"><code>"round"</code>, <code>"restShort"</code>, <code>"restLong"</code>, <code>"dawn"</code>, <code>"dusk"</code>, <code>"midnight"</code>, <code>"week"</code>, <code>"month"</code>, <code>"year"</code>, <code>"decade"</code>, <code>"century"</code>, <code>"special"</code></span>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rechargeAmount</code>
      <span class="prop-type">string | integer</span>
    </div>
    <div class="prop-card-val">
      Charges recovered on recharge. Can be a fixed number or a dice expression.
      <pre><code class="language-json">"rechargeAmount": "1d3+1"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>attachedSpells</code>
      <span class="prop-type">array | object</span>
    </div>
    <div class="prop-card-val">
      Spells castable from this weapon. Either a flat array of spell names, or an object mapping charge costs to spell arrays.
      <pre><code class="language-json">"attachedSpells": { "charges": { "1": ["detect magic"], "2": ["misty step"] } }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>wondrous</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if this is a wondrous item.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>sentient</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if sentient.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>curse</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if cursed.</div>
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
    <div class="prop-card-val">Ability score increases or overrides granted when held/attuned.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>modifySpeed</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Speed adjustments. Use <code>"*"</code> for all movement types, or named types (<code>"walk"</code>, <code>"fly"</code>, etc.) for specific speeds.
      <pre><code class="language-json">"modifySpeed": { "bonus": { "*": 10 } }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage resistances granted while wielding this weapon.</div>
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
      <code>vulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage vulnerabilities granted.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Condition immunities granted.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>lootTables</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Random loot tables this weapon belongs to.</div>
  </div>
</div>

### Fluff

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>fluff</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Embedded flavor text and images, displayed separately from <code>entries</code>.</div>
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
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
</div>

### Generic Variants

Generic variants automatically generate magic versions of a weapon across matching
base items. They go in the **`magicvariant`** array, not `item` — its `requires`,
`excludes`, and `inherits` keys belong to the variant object, not to the top-level
item properties documented above, so they are shown here as a worked example rather
than in the property reference. The full format is in
[magicvariant-conversion.md](magicvariant-conversion.md).

- `requires` — an array of filter objects matching base items. Valid boolean flag
  keys: `sword`, `axe`, `bow`, `crossbow`, `dagger`, `hammer`, `mace`, `spear`,
  `club`, `polearm`, `lance`, `rapier`, `whip`, `halberd`, `glaive`, `net`,
  `firearm`, `arrow`, `bolt`, `weapon`.
- `excludes` — an object filtering base items out of the variant (same flag keys as
  `requires`).
- `inherits` — the properties applied to each generated variant. Supports
  `namePrefix`, `nameSuffix`, `nameRemove`, and any standard item property.
  **`source` goes here, not at the top level**, and `inherits` must also carry
  `rarity` (or put `rarity` at the variant's top level instead).

```json
{
  "name": "Flame Tongue",
  "type": "GV|DMG",
  "requires": [{ "sword": true }],
  "excludes": { "net": true },
  "inherits": {
    "source": "MyHomebrew",
    "namePrefix": "Flame Tongue ",
    "rarity": "rare",
    "reqAttune": true,
    "entries": [
      "You can use a bonus action to speak this magic sword's command word, causing flames to erupt from the blade. While the sword is ablaze, it deals an extra {@damage 2d6} fire damage to any target it hits."
    ]
  }
}
```

---

## Examples

### Example 1: Versatile Martial Weapon

A mundane bastard sword showing martial classification, slashing damage, and versatile two-handed damage. **Goes in `baseitem`.**

```json
{
  "name": "Bastard Sword",
  "source": "MyHomebrew",
  "page": 5,
  "type": "M",
  "rarity": "none",
  "weight": 6,
  "value": 3500,
  "weaponCategory": "martial",
  "property": ["V"],
  "dmg1": "1d10",
  "dmgType": "S",
  "dmg2": "1d12",
  "sword": true,
  "weapon": true
}
```

### Example 2: Ranged Weapon with Ammunition

A composite bow showing ammunition type, range, and two-handed/heavy properties. **Goes in `baseitem`.**

```json
{
  "name": "Composite Bow",
  "source": "MyHomebrew",
  "page": 6,
  "type": "R",
  "rarity": "none",
  "weight": 2,
  "value": 5000,
  "weaponCategory": "martial",
  "property": ["A", "H", "2H"],
  "range": "150/600",
  "dmg1": "2d4",
  "dmgType": "P",
  "bow": true,
  "weapon": true,
  "ammoType": "arrow|phb"
}
```

### Example 3: Magic Weapon with Charges and Spells

A magic war pick requiring attunement, granting a +2 bonus, with charges that recharge at dawn and spell casting from the weapon. **Goes in `item`.**

```json
{
  "name": "Pick of the Astral Plane",
  "source": "MyHomebrew",
  "page": 12,
  "baseItem": "war pick|phb",
  "type": "M",
  "tier": "major",
  "rarity": "very rare",
  "reqAttune": "by a spellcaster",
  "weight": 2,
  "weaponCategory": "martial",
  "dmg1": "1d8",
  "dmgType": "P",
  "bonusWeapon": "+2",
  "charges": 4,
  "recharge": "dawn",
  "rechargeAmount": "1d3+1",
  "attachedSpells": {
    "charges": {
      "1": ["detect magic"],
      "2": ["misty step"]
    }
  },
  "entries": [
    "You gain a +2 bonus to attack and damage rolls made with this pick. It has 4 charges and regains 1d3 + 1 expended charges daily at dawn. You can expend charges to cast spells from it."
  ]
}
```

---

## Schema References

- **Item schema:** `5etools-utils/schema/brew/items.json`
- **Item types:** `5etools-utils/schema/brew/items-shared.json` (`#/$defs/itemType`)
- **Base item schema:** `5etools-utils/schema/brew/items-base.json`
- **Magic variant schema:** `5etools-utils/schema/brew/magicvariants.json`
