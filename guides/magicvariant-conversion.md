# Magic / Generic Variants `magicvariant`

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
  "magicvariant": [ ... ]
}
```

---

## What is a magic variant?

A **magic variant** (a _generic variant_) is a **template** that turns a whole family of base items into magic items in one stroke — _"+1 Weapon"_, _"Armor of Resistance"_, _"Vicious Weapon"_. Instead of writing a separate `item` for every base weapon, you write one `magicvariant` that:

- **selects** which base items it applies to, with `requires` (and narrows with `excludes`);
- **transforms** each matching base item, with `inherits` (the properties layered on — bonuses, rarity, attunement, renaming, and so on).

The renderer then generates one concrete item per matching base item at load time. In the Homebrew Parser outline, a variant that names a specific base in `inherits` is nested under that `baseitem`/`item` (see the base-item nesting behaviour); broad `requires`-only variants stay top-level.

### The three moving parts

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>requires</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      One or more filter objects; a base item must match <em>any</em> object (and every condition within it) to receive the variant. Conditions are base-item flags/fields — e.g. <code>{ "weapon": true }</code> (all weapons), <code>{ "sword": true }</code>, <code>{ "type": "HA|phb" }</code>, <code>{ "name": "Longsword" }</code>.
      <pre><code class="language-json">"requires": [{ "weapon": true }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>excludes</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">A single filter object; any base item matching it is removed from the set, even if <code>requires</code> matched it. e.g. <code>{ "net": true }</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>inherits</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      The changes applied to each generated variant. This is where the magic lives — <code>rarity</code>, <code>bonusWeapon</code>/<code>bonusAc</code>, <code>reqAttune</code>, <code>namePrefix</code>/<code>nameSuffix</code>, <code>entries</code>, <code>valueExpression</code>, etc. Most base stats (<code>type</code>, <code>property</code>) should be omitted so the base item's own values carry through.
      Unless the variant sets <code>source</code> and <code>rarity</code> at its top level, <code>inherits</code> must carry <code>source</code>.
      <pre><code class="language-json">"inherits": { "source": "MyBrew", "namePrefix": "+1 ", "rarity": "uncommon", "bonusWeapon": "+1" }</code></pre>
      <p>A handful of keys exist only here, because they describe the <em>transform</em> rather than a finished item:</p>
      <ul>
        <li><code>nameRemove</code> <span class="prop-type">string</span> — text stripped from the base item's name before the prefix/suffix are applied.</li>
        <li><code>propertyAdd</code> <span class="prop-type">array</span> — item properties granted to the variant, if the base item does not already have them.</li>
        <li><code>propertyRemove</code> <span class="prop-type">array</span> — item properties stripped from the variant, if present on the base item.</li>
        <li><code>weightExpression</code> <span class="prop-type">string</span> — expression used to compute each variant's weight, the weight counterpart to <code>valueExpression</code>.</li>
        <li><code>barding</code> <span class="prop-type">boolean</span> — marks the generated variants as barding.</li>
      </ul>
    </div>
  </div>
</div>

> Apart from the transform-only keys listed above, the properties **inside** `requires`, `excludes`, and `inherits` are validated separately and are documented in the base-item and item guides (they mirror those field names). The table below lists only the **top-level** keys of a `magicvariant` entry.

---

## File-level `_meta`

The root object of a `magicvariants.json` file accepts an optional **`_meta`** block, exactly as other homebrew data types do. It is validated against the same shared `metaBlock` definition, so `sources`, `dateAdded`, `dateLastModified`, `edition`, `dependencies`, `includes`, and the type-shorthand registries all behave identically here.

This matters most for standalone variant files: `_meta.sources` supplies the source identifier (`json`) the variants reference, and `_meta.dependencies` declares the brews whose base items the variants need loaded in order to resolve `requires`.

```json
{
  "$schema": "https://raw.githubusercontent.com/TheGiddyLimit/5etools-utils/master/schema/brew-fast/homebrew.json",
  "_meta": {
    "sources": [
      {
        "json": "MyBrew",
        "abbreviation": "MB",
        "full": "My Homebrew",
        "authors": ["Jane Homebrewer"],
        "version": "1.0.0"
      }
    ],
    "dependencies": {
      "magicvariant": ["SomeOtherBrew"]
    },
    "dateAdded": 1768435200,
    "dateLastModified": 1768435200,
    "edition": "classic"
  },
  "magicvariant": [
    {
      "name": "+1 Weapon",
      "requires": [{ "weapon": true }],
      "inherits": {
        "source": "MyBrew",
        "namePrefix": "+1 ",
        "rarity": "uncommon",
        "bonusWeapon": "+1"
      }
    }
  ]
}
```

See [meta.md](meta.md) for the full `_meta` schema.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The variant's template name, e.g. <code>"+1 Weapon"</code> or <code>"Armor of Resistance"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>). (On brew-root-rarity variants this sits at top level; on classic variants it is supplied inside <code>inherits</code>.)</div>
  </div>
</div>

<code>requires</code> and <code>inherits</code> are also effectively required — a variant with neither selects nothing and transforms nothing.

### Complete Property Index

Every top-level property a `magicvariant` entry may declare. Shared identity properties behave as in the `item` guide.

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Template name (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value.</td></tr>
    <tr><td><code>requires</code></td><td>array</td><td>Filter objects selecting which base items the variant applies to.</td></tr>
    <tr><td><code>excludes</code></td><td>object</td><td>Filter object removing base items from the selected set.</td></tr>
    <tr><td><code>inherits</code></td><td>object</td><td>Properties layered onto each generated variant.</td></tr>
    <tr><td><code>rarity</code></td><td>string</td><td>Rarity at the root (brew-root-rarity form); otherwise set inside <code>inherits</code>.</td></tr>
    <tr><td><code>type</code></td><td>string</td><td>Item category code, when the variant fixes a type.</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Template-level description text.</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>group</code></td><td>array</td><td>Item group membership.</td></tr>
    <tr><td><code>edition</code></td><td>string</td><td>Rules edition tag (<code>"classic"</code> / <code>"one"</code>).</td></tr>
    <tr><td><code>noDisplay</code></td><td>boolean</td><td>Generate the variants but hide the template itself from listings.</td></tr>
    <tr><td><code>ammo</code></td><td>boolean</td><td>Adds ammunition text to the generated variant's header.</td></tr>
    <tr><td><code>charges</code></td><td>string | integer</td><td>Charges granted to each variant.</td></tr>
    <tr><td><code>attachedSpells</code></td><td>array</td><td>Spells attached to each variant.</td></tr>
    <tr><td><code>reqAttuneTags</code></td><td>array</td><td>Structured attunement-requirement tags.</td></tr>
    <tr><td><code>reqAttuneAltTags</code></td><td>array</td><td>Alternate attunement-requirement tags.</td></tr>
    <tr><td><code>weaponCategory</code></td><td>string</td><td><code>"simple"</code> / <code>"martial"</code>, when fixed by the variant.</td></tr>
    <tr><td><code>customProperties</code></td><td>object</td><td>Homebrew-defined properties applied to variants.</td></tr>
    <tr><td><code>hasFluff</code></td><td>boolean</td><td>Has associated fluff entries.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td>boolean</td><td>Has associated fluff images.</td></tr>
    <tr><td><code>fluff</code></td><td>object</td><td>Inline fluff (lore/images).</td></tr>
    <tr><td><code>foundrySystem</code></td><td>object</td><td>Foundry system data.</td></tr>
    <tr><td><code>foundryActivities</code></td><td>array</td><td>Foundry activities.</td></tr>
    <tr><td><code>foundryFlags</code></td><td>object</td><td>Foundry flags.</td></tr>
    <tr><td><code>foundryEffects</code></td><td>array</td><td>Foundry active effects.</td></tr>
    <tr><td><code>foundryImg</code></td><td>string</td><td>Foundry icon path.</td></tr>
    <tr><td><code>_foundryMerge</code></td><td>object</td><td>Foundry merge directive.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another variant, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
  </tbody>
</table>

---

## Schema References

- **Magic variant schema:** `5etools-utils/schema/brew/magicvariants.json` (`schema-template/magicvariants.json`, v1.9.21) — the root object accepts `magicvariant` plus an optional `_meta`.
- **`_meta` block:** [meta.md](meta.md)
- **Item / base-item properties (used inside `requires`, `excludes`, `inherits`):** [item-conversion.md](item-conversion.md), [baseitem-conversion.md](baseitem-conversion.md), [item-properties-reference.md](item-properties-reference.md)
- **Copy / inheritance:** [Spec_Copy.md](Spec_Copy.md)
