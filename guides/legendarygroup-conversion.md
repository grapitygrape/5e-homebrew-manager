# Legendary Groups `legendaryGroup`

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
  "legendaryGroup": [ ... ]
}
```

---

## What is a legendary group?

A **legendary group** holds the shared _out-of-stat-block_ material a legendary creature uses: its **lair actions**, **regional effects**, and (for mythic monsters) its **mythic encounter** text. A `monster` links to one via its `legendaryGroup` field (matched on name + source), so several related creatures can reference the same lair/regional block without repeating it.

Only `name` and `source` are required. Each of the effect fields is an array of standard entry objects/strings (the same `entries` format used elsewhere, with `{@…}` inline tags).

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The group's name — a <code>monster</code>'s <code>legendaryGroup.name</code> must match this.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>).</div>
  </div>
</div>

### Content

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>lairActions</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Entry objects describing the creature's lair actions (usually a <code>list</code> of options plus intro text).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>regionalEffects</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Entry objects describing effects on the region around the lair.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>mythicEncounter</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Entry objects for the creature's mythic-encounter feature, if it has one.</div>
  </div>
</div>

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Group name (required); link target for a monster's <code>legendaryGroup</code>.</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>additionalSources</code></td><td>array</td><td>Additional sources the group appears in.</td></tr>
    <tr><td><code>lairActions</code></td><td>array</td><td>Lair-action entries.</td></tr>
    <tr><td><code>regionalEffects</code></td><td>array</td><td>Regional-effect entries.</td></tr>
    <tr><td><code>mythicEncounter</code></td><td>array</td><td>Mythic-encounter entries.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another legendary group, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>_versions</code></td><td>array</td><td>Generates multiple legendary-group variants from a single template. Rarely used in homebrew; see the source schema for the full spec.</td></tr>
  </tbody>
</table>
