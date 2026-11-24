# Base Items `baseitem`

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
  "baseitem": [ ... ]
}
```

---

## What is a base item?

A **base item** is a _template_ weapon, armor, or piece of gear that other content builds on. Base items live in their own top-level `baseitem` array (not `item`), and they are the mundane foundations that magic and generic variants inherit from.

Three things reference a base item:

- **`magicvariant`** entities select base items with `requires`/`excludes` and layer properties on via `inherits` (e.g. _"+1 Weapon"_ applies to every base item flagged `"weapon": true`). See `magicvariant-conversion` (deferred).
- **`item`** entities point at their mundane origin with the `baseItem` string field (e.g. a named magic sword whose `baseItem` is `"longsword|phb"`).
- The generic-variant merge system reads the boolean **merge flags** below (`sword`, `axe`, `armor`, `weapon`, …) to decide which variants apply to which base.

A base item uses the **same property vocabulary as `item`** — everything documented in the `item-conversion` guide applies here — plus the base-item-specific weapon/armor statistics and merge flags listed below. When in doubt about a shared property, read the `item-conversion` guide and the `item-properties-reference`.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The base item's display name, e.g. <code>"Longsword"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>type</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Item category code — determines whether the base is a weapon, armor, or gear.
      <ul>
        <li><code>"M"</code> — Melee Weapon, <code>"R"</code> — Ranged Weapon, <code>"A"</code> — Ammunition</li>
        <li><code>"LA"</code> / <code>"MA"</code> / <code>"HA"</code> — Light/Medium/Heavy Armor, <code>"S"</code> — Shield</li>
        <li><code>"G"</code> — Adventuring Gear, <code>"SCF"</code> — Spellcasting Focus, <code>"OTH"</code> — Other</li>
      </ul>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rarity</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Base items are mundane, so this is almost always <code>"none"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>).</div>
  </div>
</div>

### Weapon & Armor Statistics

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dmg1</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Primary damage dice, e.g. <code>"1d8"</code>. Pair with <code>dmgType</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dmg2</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Versatile / alternate damage dice, e.g. <code>"1d10"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>property</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Weapon property codes (<code>"V"</code> versatile, <code>"F"</code> finesse, <code>"T"</code> thrown, …), as abbreviations or wrapper objects.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ac</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Base armor class granted by an armor/shield base item.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>strength</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Minimum Strength score to wear heavy armor without a speed penalty, e.g. <code>"13"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weaponCategory</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val"><code>"simple"</code> or <code>"martial"</code> — governs proficiency.</div>
  </div>
</div>

### Generic-variant merge flags

Base items carry boolean **merge flags** so the generic-variant system knows which magic variants apply to them. Set the flags that describe the base (a longsword sets <code>"weapon": true</code> and <code>"sword": true</code>); a magic variant that <code>requires</code> one of these flags then applies to every base item that sets it. All flags are optional booleans and are indexed in the table below.

### Complete Property Index

Every top-level property a `baseitem` may declare. Shared properties behave exactly as documented in the `item-conversion` guide.

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Display name (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>group</code></td><td>array</td><td>Item group membership.</td></tr>
    <tr><td><code>edition</code></td><td>string</td><td>Rules edition tag (<code>"classic"</code> / <code>"one"</code>).</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this entry. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> (renderer tag, when the reprint is a different kind of entity) and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>). The object form needs at least one key besides <code>uid</code>; no other keys, no duplicates.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Additional sources the item also appears in.</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>type</code></td><td>string</td><td>Item category code (required).</td></tr>
    <tr><td><code>typeAlt</code></td><td>string</td><td>Secondary category code.</td></tr>
    <tr><td><code>rarity</code></td><td>string</td><td>Rarity — <code>"none"</code> for base items (required).</td></tr>
    <tr><td><code>valueRarity</code></td><td>string</td><td>Rarity used only for value calculation.</td></tr>
    <tr><td><code>weaponCategory</code></td><td>string</td><td><code>"simple"</code> / <code>"martial"</code>.</td></tr>
    <tr><td><code>scfType</code></td><td>string</td><td>Spellcasting-focus type (<code>"arcane"</code>, <code>"druid"</code>, <code>"holy"</code>).</td></tr>
    <tr><td><code>value</code></td><td>number</td><td>Cost in copper pieces.</td></tr>
    <tr><td><code>valueMult</code></td><td>number</td><td>Value multiplier for generic variants.</td></tr>
    <tr><td><code>weight</code></td><td>number</td><td>Weight in pounds.</td></tr>
    <tr><td><code>weightMult</code></td><td>number</td><td>Weight multiplier for generic variants.</td></tr>
    <tr><td><code>quantity</code></td><td>integer</td><td>Default stack quantity.</td></tr>
    <tr><td><code>currencyConversion</code></td><td>string</td><td>ID of a value-conversion table (homebrew only).</td></tr>
    <tr><td><code>dmg1</code></td><td>string</td><td>Primary damage dice.</td></tr>
    <tr><td><code>dmg2</code></td><td>string</td><td>Versatile / alternate damage dice.</td></tr>
    <tr><td><code>dmgType</code></td><td>string</td><td>Damage type tag (<code>"S"</code>, <code>"P"</code>, <code>"B"</code>, …).</td></tr>
    <tr><td><code>property</code></td><td>array</td><td>Weapon property codes.</td></tr>
    <tr><td><code>range</code></td><td>string</td><td>Weapon range, e.g. <code>"80/320"</code>.</td></tr>
    <tr><td><code>reload</code></td><td>integer</td><td>Ammunition capacity before reloading.</td></tr>
    <tr><td><code>reach</code></td><td>integer</td><td>Extra reach in feet.</td></tr>
    <tr><td><code>mastery</code></td><td>array</td><td>Weapon mastery properties (2024 rules).</td></tr>
    <tr><td><code>ammoType</code></td><td>string</td><td>Ammunition consumed, e.g. <code>"arrow|phb"</code>.</td></tr>
    <tr><td><code>firearm</code></td><td>boolean</td><td>Marks the base as a firearm.</td></tr>
    <tr><td><code>ac</code></td><td>integer</td><td>Base armor class.</td></tr>
    <tr><td><code>bonusAc</code></td><td>string</td><td>AC bonus expression (e.g. <code>"+1"</code>).</td></tr>
    <tr><td><code>acSpecial</code></td><td>string</td><td>Special AC calculation text.</td></tr>
    <tr><td><code>stealth</code></td><td>boolean</td><td>Imposes disadvantage on Stealth.</td></tr>
    <tr><td><code>strength</code></td><td>string</td><td>Minimum Strength for heavy armor.</td></tr>
    <tr><td><code>dexterityMax</code></td><td>integer</td><td>Max Dex bonus to AC (medium armor).</td></tr>
    <tr><td><code>armor</code></td><td>boolean</td><td>Merge flag: base is armor.</td></tr>
    <tr><td><code>bonusWeapon</code></td><td>string</td><td>Attack &amp; damage bonus expression.</td></tr>
    <tr><td><code>bonusWeaponAttack</code></td><td>string</td><td>Attack-roll bonus expression.</td></tr>
    <tr><td><code>bonusWeaponDamage</code></td><td>string</td><td>Damage bonus expression.</td></tr>
    <tr><td><code>bonusWeaponCritDamage</code></td><td>string</td><td>Bonus damage on a critical hit.</td></tr>
    <tr><td><code>bonusSpellAttack</code></td><td>string</td><td>Bonus to spell attack rolls.</td></tr>
    <tr><td><code>bonusSpellDamage</code></td><td>string</td><td>Bonus to spell damage.</td></tr>
    <tr><td><code>bonusSpellSaveDc</code></td><td>string</td><td>Bonus to spell save DC.</td></tr>
    <tr><td><code>bonusSavingThrow</code></td><td>string</td><td>Bonus to saving throws.</td></tr>
    <tr><td><code>bonusAbilityCheck</code></td><td>string</td><td>Bonus to ability checks.</td></tr>
    <tr><td><code>bonusProficiencyBonus</code></td><td>string</td><td>Bonus to proficiency bonus.</td></tr>
    <tr><td><code>bonusSavingThrowConcentration</code></td><td>string</td><td>Bonus to concentration saves.</td></tr>
    <tr><td><code>vulnerable</code></td><td>array</td><td>Damage vulnerabilities granted.</td></tr>
    <tr><td><code>resist</code></td><td>array</td><td>Damage resistances granted.</td></tr>
    <tr><td><code>immune</code></td><td>array</td><td>Damage immunities granted.</td></tr>
    <tr><td><code>conditionImmune</code></td><td>array</td><td>Condition immunities granted.</td></tr>
    <tr><td><code>charges</code></td><td>string | integer</td><td>Charges the item holds.</td></tr>
    <tr><td><code>recharge</code></td><td>string</td><td>Recharge timing (<code>"dawn"</code>, …).</td></tr>
    <tr><td><code>rechargeAmount</code></td><td>string | integer</td><td>Charges regained on recharge.</td></tr>
    <tr><td><code>age</code></td><td>string</td><td>Historical age tag (e.g. <code>"modern"</code>).</td></tr>
    <tr><td><code>speed</code></td><td>number</td><td>Vehicle/mount speed, where relevant.</td></tr>
    <tr><td><code>carryingCapacity</code></td><td>number</td><td>Carrying capacity for mounts/vehicles.</td></tr>
    <tr><td><code>packContents</code></td><td>array</td><td>Contents of an equipment pack.</td></tr>
    <tr><td><code>lootTables</code></td><td>array</td><td>Loot tables this item appears on.</td></tr>
    <tr><td><code>miscTags</code></td><td>array</td><td>Miscellaneous behaviour tags.</td></tr>
    <tr><td><code>light</code></td><td>array</td><td>Light radius data.</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Description text (strings and entry objects).</td></tr>
    <tr><td><code>customProperties</code></td><td>array</td><td>Homebrew-defined weapon properties.</td></tr>
    <tr><td><code>staff</code></td><td>boolean</td><td>Adds the italic "Staff" tag to the info line.</td></tr>
    <tr><td><code>weapon</code></td><td>boolean</td><td>Merge flag: base is a weapon.</td></tr>
    <tr><td><code>sword</code></td><td>boolean</td><td>Merge flag: sword.</td></tr>
    <tr><td><code>axe</code></td><td>boolean</td><td>Merge flag: axe.</td></tr>
    <tr><td><code>mace</code></td><td>boolean</td><td>Merge flag: mace.</td></tr>
    <tr><td><code>spear</code></td><td>boolean</td><td>Merge flag: spear.</td></tr>
    <tr><td><code>hammer</code></td><td>boolean</td><td>Merge flag: hammer.</td></tr>
    <tr><td><code>bow</code></td><td>boolean</td><td>Merge flag: bow.</td></tr>
    <tr><td><code>crossbow</code></td><td>boolean</td><td>Merge flag: crossbow.</td></tr>
    <tr><td><code>club</code></td><td>boolean</td><td>Merge flag: club.</td></tr>
    <tr><td><code>dagger</code></td><td>boolean</td><td>Merge flag: dagger.</td></tr>
    <tr><td><code>net</code></td><td>boolean</td><td>Merge flag: net.</td></tr>
    <tr><td><code>polearm</code></td><td>boolean</td><td>Merge flag: polearm.</td></tr>
    <tr><td><code>lance</code></td><td>boolean</td><td>Merge flag: lance.</td></tr>
    <tr><td><code>rapier</code></td><td>boolean</td><td>Merge flag: rapier.</td></tr>
    <tr><td><code>whip</code></td><td>boolean</td><td>Merge flag: whip.</td></tr>
    <tr><td><code>halberd</code></td><td>boolean</td><td>Merge flag: halberd.</td></tr>
    <tr><td><code>glaive</code></td><td>boolean</td><td>Merge flag: glaive.</td></tr>
    <tr><td><code>arrow</code></td><td>boolean</td><td>Merge flag: arrow ammunition.</td></tr>
    <tr><td><code>bolt</code></td><td>boolean</td><td>Merge flag: bolt ammunition.</td></tr>
    <tr><td><code>bulletFirearm</code></td><td>boolean</td><td>Merge flag: firearm bullet.</td></tr>
    <tr><td><code>bulletSling</code></td><td>boolean</td><td>Merge flag: sling bullet.</td></tr>
    <tr><td><code>cellEnergy</code></td><td>boolean</td><td>Merge flag: energy cell.</td></tr>
    <tr><td><code>needleBlowgun</code></td><td>boolean</td><td>Merge flag: blowgun needle.</td></tr>
    <tr><td><code>hasFluff</code></td><td>boolean</td><td>Has associated fluff entries.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td>boolean</td><td>Has associated fluff images.</td></tr>
    <tr><td><code>fluff</code></td><td>object</td><td>Inline fluff (lore/images).</td></tr>
    <tr><td><code>foundryType</code></td><td>string</td><td>Foundry VTT item type override.</td></tr>
    <tr><td><code>foundrySystem</code></td><td>object</td><td>Foundry system data.</td></tr>
    <tr><td><code>foundryActivities</code></td><td>array</td><td>Foundry activities.</td></tr>
    <tr><td><code>foundryFlags</code></td><td>object</td><td>Foundry flags.</td></tr>
    <tr><td><code>foundryEffects</code></td><td>array</td><td>Foundry active effects.</td></tr>
    <tr><td><code>foundryImg</code></td><td>string</td><td>Foundry icon path.</td></tr>
    <tr><td><code>_foundryMerge</code></td><td>object</td><td>Foundry merge directive.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another base item, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
  </tbody>
</table>
