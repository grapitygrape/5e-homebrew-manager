# Deities `deity`

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
  "deity": [ ... ]
}
```

---

## What is a deity?

A **deity** entry is a god, demigod, or other divine power a cleric or paladin might serve. Beyond identity, it records the mechanically-relevant <code>domains</code> and <code>favoredWeapons</code>, plus flavour such as <code>pantheon</code>, <code>alignment</code>, <code>title</code>, <code>symbol</code>, <code>dogma</code>, and home <code>plane</code>. <code>name</code> and <code>source</code> are required; most deities also set <code>pantheon</code> and <code>alignment</code>.

---

## Property Reference

### Identity

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Deity name (required).</div>
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
      <code>pantheon</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Pantheon the deity belongs to, e.g. <code>"Faerûnian"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alignment</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Alignment code(s), e.g. <code>["L","G"]</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>title</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Epithet/title, e.g. "the Lord of Murder".</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>category</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Deity category (e.g. greater/lesser).</div>
  </div>
</div>

### Worship & mechanics

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>domains</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Cleric domains the deity grants.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>favoredWeapons</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Favoured weapon(s).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>symbol</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Holy symbol description.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dogma</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Summary of the deity's teachings.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>plane</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Home plane.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>worshipers</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Typical worshipers.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>province</code>
      <span class="prop-type">string | array</span>
    </div>
    <div class="prop-card-val">Areas of influence / portfolio.</div>
  </div>
</div>

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Deity name (required).</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>reprintAlias</code></td><td>string</td><td>Alias used when reprinted.</td></tr>
    <tr><td><code>alignment</code></td><td>array</td><td>Alignment code(s), e.g. <code>["L","G"]</code>.</td></tr>
    <tr><td><code>title</code></td><td>string</td><td>Epithet/title, e.g. "the Lord of Murder".</td></tr>
    <tr><td><code>pantheon</code></td><td>string</td><td>Pantheon the deity belongs to, e.g. <code>"Faerûnian"</code>.</td></tr>
    <tr><td><code>category</code></td><td>string</td><td>Deity category (e.g. greater/lesser).</td></tr>
    <tr><td><code>domains</code></td><td>array</td><td>Cleric domains the deity grants.</td></tr>
    <tr><td><code>province</code></td><td>string | array</td><td>Areas of influence / portfolio.</td></tr>
    <tr><td><code>symbol</code></td><td>string</td><td>Holy symbol description.</td></tr>
    <tr><td><code>dogma</code></td><td>string</td><td>Summary of the deity's teachings.</td></tr>
    <tr><td><code>favoredWeapons</code></td><td>array</td><td>Favoured weapon(s).</td></tr>
    <tr><td><code>plane</code></td><td>string</td><td>Home plane.</td></tr>
    <tr><td><code>worshipers</code></td><td>string</td><td>Typical worshipers.</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Description text.</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>additionalSources</code></td><td>array</td><td>Additional sources.</td></tr>
    <tr><td><code>altNames</code></td><td>array</td><td>Alternate names the deity is known by.</td></tr>
    <tr><td><code>symbolImg</code></td><td>object</td><td>Holy-symbol image reference.</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>customExtensionOf</code></td><td>string</td><td>Marks this as a homebrew extension of an existing deity.</td></tr>
    <tr><td><code>piety</code></td><td>object</td><td>Piety-system trait data (MOT).</td></tr>
    <tr><td><code>customProperties</code></td><td>object</td><td>Homebrew-defined properties.</td></tr>
    <tr><td><code>foundryImg</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another deity, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>foundryAdvice</code></td><td>object</td><td>Advice entry rendered for the Foundry importer.</td></tr>
  </tbody>
</table>
