# Conditions `condition`

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
  "condition": [ ... ],
  "status": [ ... ]
}
```

You can include `condition`, `status`, or both. The `disease` array uses a similar but distinct schema.

## Condition vs Status

| Array       | Use                                 | Examples                                                                                             |
| ----------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `condition` | Standard conditions from PHB/combat | Blinded, Charmed, Frightened, Grappled, Paralyzed, Poisoned, Prone, Restrained, Stunned, Unconscious |
| `status`    | Special states or tracking effects  | Concentration, Bloodied (2024)                                                                       |

Use `condition` for effects that impose mechanical penalties or restrictions. Use `status` for effects that track a state or don't fit the standard condition mold.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The condition or status name.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>source</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Source identifier — must exactly match a <code>json</code> value in <code>_meta.sources</code> (not its <code>abbreviation</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Description and rules (strings and entry objects).</div>
  </div>
</div>

### Optional

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source book.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Other sources where this condition appears.
      <pre><code class="language-json">"otherSources": [{ "source": "RMR", "page": 62 }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Links to updated versions. <pre><code class="language-json">"reprintedAs": ["Blinded|XPHB"]</code></pre>
      Each entry is either a bare UID string, or an object when the reprint needs more than a UID:
      <ul>
        <li><code>uid</code> <span class="prop-type">string</span> (required) — the reprint's UID, e.g. <code>"longsword|xphb"</code>.</li>
        <li><code>tag</code> <span class="prop-type">string</span> — the renderer tag to link through (e.g. <code>"creature"</code>), for when the reprint is a different kind of entity.</li>
        <li><code>edition</code> <span class="prop-type">string</span> — <code>"classic"</code> or <code>"one"</code>, disambiguating a reprint that exists in both rule sets.</li>
      </ul>
      The object form must carry at least one key besides <code>uid</code> — with only a <code>uid</code>, use the bare string instead. No other keys are allowed, and duplicate entries are rejected.
      <pre><code class="language-json">"reprintedAs": [{ "uid": "NAME|XPHB", "edition": "one" }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alias</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Alternative names for search.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>color</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Hex color for DM Screen display. Do not include the <code>#</code> prefix.
      <pre><code class="language-json">"color": "ff0000"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if separate fluff text exists (site data only).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluffImages</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if separate fluff images exist (site data only).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>fluff</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Embedded flavor text and images for homebrew.
      <pre><code class="language-json">"fluff": {
  "entries": ["Flavor text..."],
  "images": [...]
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources which reference this condition (e.g. in bold text).</div>
  </div>
</div>

### Foundry VTT

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryImg</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Token image path for Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundrySystem</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Override system parameters for Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryFlags</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Module flag overrides for Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryEffects</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Active status effects applied in Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryActivities</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Foundry activity configurations.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryAdvice</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Instructions or settings for VTT modules.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_foundryMerge</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Controls whether Foundry system/flags objects are merged with base values rather than overwritten. E.g. <code>{ "system": true }</code>.</div>
  </div>
</div>

---

## Entry Types

- **`type: "list"`** — Bullet list with `items` array (PHB style)
- **`type: "entries"`** — Named section with `name` and `entries` (2024 style)
- **`type: "table"`** — Table with `colLabels`, `colStyles`, `rows`

## Inline Tags

| Tag                           | Example                          | Use                  |
| ----------------------------- | -------------------------------- | -------------------- |
| `{@condition name}`           | `{@condition blinded}`           | Link to condition    |
| `{@status name}`              | `{@status concentration}`        | Link to status       |
| `{@action Name}`              | `{@action Attack}`               | Link to action       |
| `{@spell name}`               | `{@spell hold person}`           | Link to spell        |
| `{@variantrule Name\|source}` | `{@variantrule Advantage\|XPHB}` | Link to variant rule |
| `{@dc N}`                     | `{@dc 15}`                       | Format DC            |
| `{@dice NdM}`                 | `{@dice 1d20}`                   | Format dice          |

---

## Examples

### Example 1: Simple Condition (Dazed)

A standard legacy condition that uses a simple bullet list structure to outline its effects.

```json
{
  "name": "Dazed",
  "source": "MySource",
  "page": 1,
  "entries": [
    {
      "type": "list",
      "items": [
        "A dazed creature can't take actions or reactions.",
        "The creature can move and communicate normally.",
        "Attack rolls against the creature have advantage."
      ]
    }
  ]
}
```

### Example 2: Condition with Nested Entries (2024 Style)

A modern 2024-style condition featuring nested header entries to group and name different rules of the condition.

```json
{
  "name": "Blinded",
  "source": "XPHB",
  "page": 361,
  "entries": [
    "While you have the Blinded condition, you experience the following effects.",
    {
      "type": "entries",
      "entries": [
        {
          "type": "entries",
          "name": "Can't See",
          "entries": [
            "You can't see and automatically fail any ability check that requires sight."
          ]
        },
        {
          "type": "entries",
          "name": "Attacks Affected",
          "entries": [
            "{@action Attack|XPHB} rolls against you have {@variantrule Advantage|XPHB}, and your attack rolls have {@variantrule Disadvantage|XPHB}."
          ]
        }
      ]
    }
  ]
}
```

### Example 3: Status (Concentration)

A tracking status that represents a state of being rather than a mechanical combat penalty.

```json
{
  "name": "Concentration",
  "source": "PHB",
  "page": 203,
  "entries": [
    "Some spells require you to maintain {@status concentration} in order to keep their magic active. If you lose {@status concentration}, such a spell ends.",
    "You can end {@status concentration} at any time (no action required)."
  ]
}
```

---

## Schema Reference

- `5etools-utils/schema/brew/conditionsdiseases.json` — Condition, status, and disease schemas
- `5etools-utils/schema/brew/entry.json` — Entry types
