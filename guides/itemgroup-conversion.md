# Item Groups `itemGroup`

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
  "itemGroup": [ ... ]
}
```

---

## What is an item group?

An **item group** is a single catalog entry that represents a _set_ of closely-related items — _"Musical Instrument"_, _"Gaming Set"_, _"Spell Scroll (Cantrip-9th)"_, _"+1/+2/+3 Ammunition"_. Rather than list every member as its own `item`, you write one `itemGroup` whose `items` array names the members; renders the group as one entry that links to each member.

An item group **is itself an item** — it carries the full `item` property vocabulary (type, value, weight, entries, weapon/armor stats, and so on; all documented in the `item` guide) so the group entry can show representative stats. On top of that it adds the group-specific fields below.

### Group-specific properties

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>items</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      The members of the group. Each entry is either a reference string (<code>"Longsword|PHB"</code>) or an inline item object.
      <pre><code class="language-json">"items": ["Drum|PHB", "Flute|PHB", "Lute|PHB"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>itemsHidden</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Members that belong to the group but should not appear in the rendered member list (e.g. duplicates counted elsewhere).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalEntries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Extra description entries appended after the auto-generated list of members.</div>
  </div>
</div>

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The group's display name.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>).</div>
  </div>
</div>

---

## Complete Property Index

Every top-level property an `itemGroup` may declare. Properties marked "shared with <code>item</code>" behave exactly as in the `item` guide.

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Group's display name (required), e.g. "Musical Instrument".</td></tr>
    <tr><td><code>alias</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>group</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>type</code></td><td>string</td><td>Item category code shared by the group.</td></tr>
    <tr><td><code>typeAlt</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>rarity</code></td><td>string</td><td>Rarity — usually "none" for a mundane group.</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>additionalSources</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>reprintedAs</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>baseItem</code></td><td>string</td><td>Base item the group derives from, e.g. "longsword|phb".</td></tr>
    <tr><td><code>ac</code></td><td>integer</td><td>Base armor class (armor groups).</td></tr>
    <tr><td><code>age</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>carryingCapacity</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>dmg1</code></td><td>string</td><td>Primary damage dice.</td></tr>
    <tr><td><code>dmg2</code></td><td>string</td><td>Versatile / alternate damage dice.</td></tr>
    <tr><td><code>dmgType</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Description text shown for the group as a whole.</td></tr>
    <tr><td><code>additionalEntries</code></td><td>array</td><td>Extra entries appended after the generated member list.</td></tr>
    <tr><td><code>property</code></td><td>array</td><td>Weapon property codes.</td></tr>
    <tr><td><code>range</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>reload</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>reqAttune</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>reqAttuneAlt</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>curse</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>vulnerable</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>resist</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>immune</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>conditionImmune</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>detail1</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>detail2</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>scfType</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>speed</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>stealth</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>strength</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>dexterityMax</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>firearm</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>staff</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>tier</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>value</code></td><td>number</td><td>Cost in copper pieces.</td></tr>
    <tr><td><code>valueMult</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>valueRarity</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>weaponCategory</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>weight</code></td><td>number</td><td>Weight in pounds.</td></tr>
    <tr><td><code>weightMult</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>weightNote</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>wondrous</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>tattoo</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>sentient</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>poison</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>poisonTypes</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>crew</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>crewMin</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>crewMax</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>capPassenger</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>capCargo</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>vehSpeed</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>vehAc</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>vehHp</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>vehDmgThresh</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>travelCost</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>shippingCost</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>charges</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>recharge</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>rechargeAmount</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>optionalfeatures</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>attachedSpells</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>ability</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>focus</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>lootTables</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>critThreshold</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusAc</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusWeapon</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusWeaponAttack</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusWeaponDamage</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusWeaponCritDamage</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusSpellAttack</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusSpellDamage</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusSpellSaveDc</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusSavingThrow</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusAbilityCheck</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusProficiencyBonus</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>bonusSavingThrowConcentration</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>modifySpeed</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>otherSources</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>legacy</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>atomicPackContents</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>containerCapacity</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>ammoType</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>packContents</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>grantsProficiency</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>grantsLanguage</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>spellScrollLevel</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>seeAlsoDeck</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>seeAlsoVehicle</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>reqAttuneTags</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>reqAttuneAltTags</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>miscTags</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>mastery</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>reach</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>light</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>barDimensions</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>hasFluff</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>hasRefs</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>customProperties</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>acSpecial</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>currencyConversion</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>alCertificateId</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>foundryType</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>foundrySystem</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>foundryActivities</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>foundryFlags</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>foundryEffects</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>foundryImg</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>_foundryMerge</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>fluff</code></td><td></td><td>Shared with <code>item</code> — see the item guide.</td></tr>
    <tr><td><code>items</code></td><td>array</td><td>The member items: name/reference strings ("Longsword|phb") or inline item objects. The heart of a group.</td></tr>
    <tr><td><code>itemsHidden</code></td><td>array</td><td>Member items included in the group but not listed in the rendered entry.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another item group, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
  </tbody>
</table>
