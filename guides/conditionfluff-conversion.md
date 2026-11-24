# Condition Fluff `conditionFluff`

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
  "conditionFluff": [ ... ]
}
```

---

## What is Condition Fluff?

**Condition Fluff** holds the extended lore and images for a condition, kept separate from its mechanical entry so a stat block or rules block stays compact. A fluff entry is matched to its parent by **<code>name</code> + <code>source</code>**: give the fluff the same name and source as the entity it describes, then put the flavour text in <code>entries</code> and any artwork in <code>images</code>.

Only <code>name</code> and <code>source</code> are required — a fluff entry with just those and an <code>images</code> array is perfectly valid (image-only fluff).

---

## Property Reference

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Must match the parent entity's name (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Must match the parent entity's source (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">The lore / descriptive text.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>images</code>
      <span class="prop-type">array | null</span>
    </div>
    <div class="prop-card-val">Image entries, or <code>null</code> for none.</div>
  </div>
</div>

### Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Must match the parent entity's <code>name</code> (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Must match the parent entity's <code>source</code> (required).</td></tr>
    <tr><td><code>preserveName</code></td><td>boolean</td><td>Keep the fluff's own <code>name</code> rather than inheriting the parent's; always <code>true</code> when present.</td></tr>
    <tr><td><code>images</code></td><td>array | null</td><td>Image entries (<code>{type:"image", href:{...}}</code>). <code>null</code> explicitly means "no image".</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>The lore / descriptive text (strings and entry objects).</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit fluff from another entry of the same type, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
  </tbody>
</table>
