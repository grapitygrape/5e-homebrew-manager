# Traps `trap`

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
  "trap": [ ... ]
}
```

---

## What is a trap?

A **trap** is a hazard that triggers on an action or event. The schema supports two formats, selected by <code>trapHazType</code>: the **classic** DMG/XDMG format (<code>MECH</code>/<code>MAG</code>/<code>TRP</code>/<code>HAUNT</code>) using <code>trigger</code>, <code>duration</code>, and <code>rating</code>; and the **XGE "Traps Revisited"** format (<code>SMPL</code> simple / <code>CMPX</code> complex) which adds <code>initiative</code>, the element sections (<code>effect</code>, <code>eActive</code>, <code>eDynamic</code>, <code>eConstant</code>), and <code>countermeasures</code>. <code>name</code>, <code>trapHazType</code>, <code>source</code>, and <code>entries</code> are always required.

---

## Property Reference

### Required & typing

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Trap name (required).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>trapHazType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Trap kind. Classic: <code>"MECH"</code>, <code>"MAG"</code>, <code>"TRP"</code>, <code>"HAUNT"</code>. XGE: <code>"SMPL"</code> (simple), <code>"CMPX"</code> (complex). Required.</div>
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

### Classic format

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>trigger</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">What sets the trap off (required for complex traps).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>duration</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">How long the trap's effect lasts (classic format).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rating</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Threat/level rating object(s) — level range, threat, DCs.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hauntBonus</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Attack bonus for haunted traps.</div>
  </div>
</div>

### Complex (XGE) format

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>initiative</code>
      <span class="prop-type">integer | string</span>
    </div>
    <div class="prop-card-val">Initiative count a complex trap acts on (1-3).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>initiativeNote</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Note qualifying the initiative.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>effect</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">The trap's effect entries (complex traps).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>eActive</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">"Active Elements" entries (complex traps).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>eDynamic</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">"Dynamic Elements" entries (complex traps).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>eConstant</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">"Constant Elements" entries (complex traps).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>countermeasures</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">How the trap can be detected/disabled (required for complex traps).</div>
  </div>
</div>

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Trap name (required).</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>trapHazType</code></td><td>string</td><td>Trap kind. Classic: <code>"MECH"</code>, <code>"MAG"</code>, <code>"TRP"</code>, <code>"HAUNT"</code>. XGE: <code>"SMPL"</code> (simple), <code>"CMPX"</code> (complex). Required.</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Additional sources.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this entry. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> (renderer tag, when the reprint is a different kind of entity) and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>). The object form needs at least one key besides <code>uid</code>; no other keys, no duplicates.</td></tr>
    <tr><td><code>trigger</code></td><td>array</td><td>What sets the trap off (required for complex traps).</td></tr>
    <tr><td><code>duration</code></td><td>object</td><td>How long the trap's effect lasts (classic format).</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Description text (required).</td></tr>
    <tr><td><code>rating</code></td><td>array</td><td>Threat/level rating object(s) — level range, threat, DCs.</td></tr>
    <tr><td><code>hauntBonus</code></td><td>string</td><td>Attack bonus for haunted traps.</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>hasFluff</code></td><td>boolean</td><td>Presence flag.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td>boolean</td><td>Presence flag.</td></tr>
    <tr><td><code>fluff</code></td><td>object</td><td>Inline lore/images.</td></tr>
    <tr><td><code>foundryImg</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>initiative</code></td><td>integer | string</td><td>Initiative count a complex trap acts on (1-3).</td></tr>
    <tr><td><code>initiativeNote</code></td><td>string</td><td>Note qualifying the initiative.</td></tr>
    <tr><td><code>effect</code></td><td>array</td><td>The trap's effect entries (complex traps).</td></tr>
    <tr><td><code>eActive</code></td><td>array</td><td>"Active Elements" entries (complex traps).</td></tr>
    <tr><td><code>eDynamic</code></td><td>array</td><td>"Dynamic Elements" entries (complex traps).</td></tr>
    <tr><td><code>eConstant</code></td><td>array</td><td>"Constant Elements" entries (complex traps).</td></tr>
    <tr><td><code>countermeasures</code></td><td>array</td><td>How the trap can be detected/disabled (required for complex traps).</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another trap, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>foundryAdvice</code></td><td>object</td><td>Advice entry rendered for the Foundry importer.</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Sources that reference this trap (e.g. in bold text).</td></tr>
  </tbody>
</table>
