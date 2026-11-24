# Vehicle Upgrades `vehicleUpgrade`

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
  "vehicleUpgrade": [ ... ]
}
```

---

## What is a vehicle upgrade?

A **vehicle upgrade** is a modular add-on for a `vehicle` — a figurehead, hull plating, a weapon mount, an infernal war-machine component. Each upgrade is a small entry with a name, description, and an `upgradeType` classifying what it is. Upgrades are listed alongside vehicles and referenced when building out a customised ship or war machine.

`name`, `entries`, `source`, and `upgradeType` are required.

### Custom upgrade types

Homebrew can define new upgrade type codes in the `_meta` block:

```json
{
  "_meta": {
    "sources": [...],
    "vehicleUpgradeTypes": {
      "SHP:H": "Ship Upgrade, Hull",
      "IWM:A": "Infernal War Machine Upgrade, Armor"
    }
  }
}
```

Always add custom type codes to `_meta.vehicleUpgradeTypes` — otherwise they appear as raw codes in the UI.

### Built-in upgrade type codes

| Code    | Meaning                              |
| ------- | ------------------------------------ |
| `SHP:F` | Ship Upgrade, Figurehead             |
| `SHP:H` | Ship Upgrade, Hull                   |
| `SHP:M` | Ship Upgrade, Movement               |
| `SHP:O` | Ship Upgrade, Miscellaneous          |
| `SHP:W` | Ship Upgrade, Weapon                 |
| `IWM:A` | Infernal War Machine Upgrade, Armor  |
| `IWM:G` | Infernal War Machine Upgrade, Gadget |
| `IWM:W` | Infernal War Machine Variant, Weapon |

---

## Property Reference

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The upgrade's name (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>upgradeType</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Classification code(s) from the built-in table above or custom codes registered in <code>_meta.vehicleUpgradeTypes</code>. At least one value; duplicates are not allowed. Required.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>cost</code>
      <span class="prop-type">number</span>
    </div>
    <div class="prop-card-val">Purchase cost in copper pieces.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Description text (strings and entry objects). Required.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>). Required.</div>
  </div>
</div>

### Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Upgrade name (required).</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Description text (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>upgradeType</code></td><td>array</td><td>Upgrade classification code(s) (required; unique).</td></tr>
    <tr><td><code>cost</code></td><td>number</td><td>Purchase cost in copper pieces.</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Additional sources the upgrade appears in.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this entry. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> (renderer tag, when the reprint is a different kind of entity) and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>). The object form needs at least one key besides <code>uid</code>; no other keys, no duplicates.</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>hasFluff</code></td><td>boolean</td><td>Has associated fluff entries.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td>boolean</td><td>Has associated fluff images.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another vehicle upgrade, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Sources that reference this upgrade (e.g. in bold text).</td></tr>
  </tbody>
</table>
