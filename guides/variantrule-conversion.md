# Variant Rules `variantrule`

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
  "variantrule": [ ... ]
}
```

---

## What is a variant rule?

A **variant rule** is an optional or alternative rules section — a house rule, a DMG optional system, a prerelease mechanic. It is essentially a titled block of <code>entries</code> classified by <code>ruleType</code>. <code>name</code>, <code>entries</code>, and <code>source</code> are required.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Rule name (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Rule text (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — a <code>_meta.sources[].json</code> value (required).</div>
  </div>
</div>

### Classification

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ruleType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Rule classification: <code>C</code> Core, <code>O</code> Optional, <code>P</code> Prerelease, <code>V</code> Variant, <code>VO</code> Variant Optional, <code>VV</code> Variant Variant.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>type</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Section/render type (e.g. <code>"section"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source.</div>
  </div>
</div>

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Rule name (required).</td></tr>
    <tr><td><code>type</code></td><td>string</td><td>Section/render type (e.g. <code>"section"</code>).</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Rule text (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>ruleType</code></td><td>string</td><td>Rule classification: <code>C</code> Core, <code>O</code> Optional, <code>P</code> Prerelease, <code>V</code> Variant, <code>VO</code> Variant Optional, <code>VV</code> Variant Variant.</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>additionalSources</code></td><td>array</td><td>Additional sources.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Other sources the rule appears in.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this entry. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> (renderer tag, when the reprint is a different kind of entity) and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>). The object form needs at least one key besides <code>uid</code>; no other keys, no duplicates.</td></tr>
    <tr><td><code>foundryImg</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another variant rule, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>foundryAdvice</code></td><td>object</td><td>Advice entry rendered for the Foundry importer.</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Sources that reference this rule (e.g. in bold text).</td></tr>
  </tbody>
</table>
