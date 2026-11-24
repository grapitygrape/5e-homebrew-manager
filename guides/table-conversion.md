# Tables `table`

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
  "table": [ ... ]
}
```

---

## What is a table?

A **table** is a standalone rollable or reference table — a random-encounter table, a trinkets list, a name generator. The body is <code>rows</code> (each row an array of cells) with optional <code>colLabels</code>/<code>colStyles</code> for headers and formatting. Setting <code>type</code> to <code>"tableGroup"</code> turns the entry into a container whose <code>tables</code> array holds several related sub-tables. A plain table requires <code>name</code>, <code>source</code>, and <code>rows</code>; a table group requires <code>name</code>, <code>source</code>, and <code>tables</code>.

---

## Property Reference

### Required & structure

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Table name (required).</div>
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
      <code>rows</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Table body — an array of rows, each an array of cells. Required for a plain table.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>tables</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sub-tables — required (instead of <code>rows</code>) when <code>type</code> is <code>"tableGroup"</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>type</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val"><code>"table"</code> (default) or <code>"tableGroup"</code> (a container of sub-tables).</div>
  </div>
</div>

### Headers & styling

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>caption</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Caption shown above the table.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>colLabels</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Column header labels (mutually exclusive with <code>colLabelRows</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>colLabelRows</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Multi-row column headers.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>colStyles</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Per-column CSS style tokens (e.g. <code>"col-2 text-center"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rowLabels</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Row header labels.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rowStyles</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Per-row style tokens.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>isStriped</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Render with striped rows.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>style</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Table style token(s).</div>
  </div>
</div>

### Surrounding text

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>intro</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Entries shown before the table.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>outro</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Entries shown after the table.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>footnotes</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Footnote entries shown below the table.</div>
  </div>
</div>

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>tables</code></td><td>array</td><td>Sub-tables — required (instead of <code>rows</code>) when <code>type</code> is <code>"tableGroup"</code>.</td></tr>
    <tr><td><code>name</code></td><td>string</td><td>Table name (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>data</code></td><td>object</td><td>Generic data bag; <code>rd-*</code> keys become <code>data-*</code> HTML attributes.</td></tr>
    <tr><td><code>caption</code></td><td>string</td><td>Caption shown above the table.</td></tr>
    <tr><td><code>isStriped</code></td><td>boolean</td><td>Render with striped rows.</td></tr>
    <tr><td><code>isNameGenerator</code></td><td>boolean</td><td>Marks a random-name-generator table.</td></tr>
    <tr><td><code>style</code></td><td>string</td><td>Table style token(s).</td></tr>
    <tr><td><code>colLabels</code></td><td>array</td><td>Column header labels (mutually exclusive with <code>colLabelRows</code>).</td></tr>
    <tr><td><code>colLabelRows</code></td><td>array</td><td>Multi-row column headers.</td></tr>
    <tr><td><code>colStyles</code></td><td>array</td><td>Per-column CSS style tokens (e.g. <code>"col-2 text-center"</code>).</td></tr>
    <tr><td><code>rowLabels</code></td><td>array</td><td>Row header labels.</td></tr>
    <tr><td><code>rowStyles</code></td><td>array</td><td>Per-row style tokens.</td></tr>
    <tr><td><code>rows</code></td><td>array</td><td>Table body — an array of rows, each an array of cells. Required for a plain table.</td></tr>
    <tr><td><code>footnotes</code></td><td>array</td><td>Footnote entries shown below the table.</td></tr>
    <tr><td><code>intro</code></td><td>array</td><td>Entries shown before the table.</td></tr>
    <tr><td><code>outro</code></td><td>array</td><td>Entries shown after the table.</td></tr>
    <tr><td><code>type</code></td><td>string</td><td><code>"table"</code> (default) or <code>"tableGroup"</code> (a container of sub-tables).</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Additional sources.</td></tr>
    <tr><td><code>chapter</code></td><td>object</td><td>Chapter/section placement metadata.</td></tr>
    <tr><td><code>parentEntity</code></td><td>object</td><td>Links the table to a parent entity (<code>{prop, uid}</code>).</td></tr>
    <tr><td><code>foundryImg</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another table, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Sources that reference this table (e.g. in bold text).</td></tr>
  </tbody>
</table>
