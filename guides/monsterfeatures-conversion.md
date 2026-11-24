# Monster Features `monsterfeatures`

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
  "monsterfeatures": [ ... ]
}
```

---

## What are monster features?

**Monster features** are the reusable building-block traits from the DMG's "Creating a Monster" / quick-creature tools — each a named <code>effect</code> with an <code>example</code> and optional suggested stat adjustments (<code>hp</code>, <code>ac</code>, <code>dpr</code>, <code>attackBonus</code>). They power feature-picker UIs rather than being rendered as stat blocks. <code>name</code>, <code>example</code>, and <code>effect</code> are required.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Feature name (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>example</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Example of the feature in use (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>effect</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The feature's mechanical effect (required).</div>
  </div>
</div>

### Suggested adjustments

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hp</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Suggested HP adjustment when applying the feature.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ac</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Suggested AC adjustment.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dpr</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Suggested damage-per-round adjustment.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>attackBonus</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Suggested attack-bonus adjustment.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasNumberParam</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Whether applying the feature needs a numeric input.</div>
  </div>
</div>

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Feature name (required).</td></tr>
    <tr><td><code>example</code></td><td>string</td><td>Example of the feature in use (required).</td></tr>
    <tr><td><code>effect</code></td><td>string</td><td>The feature's mechanical effect (required).</td></tr>
    <tr><td><code>hp</code></td><td>string</td><td>Suggested HP adjustment when applying the feature.</td></tr>
    <tr><td><code>ac</code></td><td>string</td><td>Suggested AC adjustment.</td></tr>
    <tr><td><code>dpr</code></td><td>string</td><td>Suggested damage-per-round adjustment.</td></tr>
    <tr><td><code>attackBonus</code></td><td>string</td><td>Suggested attack-bonus adjustment.</td></tr>
    <tr><td><code>hasNumberParam</code></td><td>boolean</td><td>Whether applying the feature needs a numeric input.</td></tr>
  </tbody>
</table>
