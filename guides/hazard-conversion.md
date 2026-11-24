# Hazards `hazard`

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
  "hazard": [ ... ]
}
```

---

## What is a hazard?

A **hazard** is an environmental danger — quicksand, a cave-in, poisonous fumes — that isn't "triggered" like a trap but is simply present. Hazards share the <code>trapHazType</code> classifier and <code>rating</code> with traps but are otherwise a simple <code>name</code> + <code>entries</code> block. <code>name</code>, <code>trapHazType</code>, <code>source</code>, and <code>entries</code> are required.

---

## Property Reference

### Required & typing

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Hazard name (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>trapHazType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Hazard kind — typically <code>"ENV"</code> (environmental) or <code>"EST"</code>. Required.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — a <code>_meta.sources[].json</code> value (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Description text (required).</div>
  </div>
</div>

### Details

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rating</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Threat/level rating object(s).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Additional sources.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>legacy</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Marks pre-errata/legacy content.</div>
  </div>
</div>

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Hazard name (required).</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>trapHazType</code></td><td>string</td><td>Hazard kind — typically <code>"ENV"</code> (environmental) or <code>"EST"</code>. Required.</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Additional sources.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this entry. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> (renderer tag, when the reprint is a different kind of entity) and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>). The object form needs at least one key besides <code>uid</code>; no other keys, no duplicates.</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Description text (required).</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>rating</code></td><td>array</td><td>Threat/level rating object(s).</td></tr>
    <tr><td><code>hasFluff</code></td><td>boolean</td><td>Presence flag.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td>boolean</td><td>Presence flag.</td></tr>
    <tr><td><code>foundrySystem</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>foundryActivities</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>foundryFlags</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>foundryEffects</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>foundryImg</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>_foundryMerge</code></td><td>object</td><td>Foundry merge directive.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another hazard, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>foundryAdvice</code></td><td>object</td><td>Advice entry rendered for the Foundry importer.</td></tr>
  </tbody>
</table>
