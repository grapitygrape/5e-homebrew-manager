# Actions `action`

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
  "action": [ ... ]
}
```

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The action's display name.</div>
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
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source book. Required by the schema; use <code>1</code> for homebrew-only actions.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Description and mechanics. Can include plain strings and entry objects.</div>
  </div>
</div>

### Optional

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>time</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Action cost. Each entry is an object with <code>number</code> (integer, usually <code>1</code>) and <code>unit</code> (string). Valid <code>unit</code> values: <code>"action"</code>, <code>"bonus"</code>, <code>"reaction"</code>.
      <pre><code class="language-json">"time": [{ "number": 1, "unit": "reaction" }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>fromVariant</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Links the action to a variant rule.
      <pre><code class="language-json">"fromVariant": "Variant: Dismounting|PHB"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>seeAlsoAction</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Related action names for cross-reference, rendered as a "See Also" footnote. At least one entry if present, and duplicates are rejected.
      <pre><code class="language-json">"seeAlsoAction": ["Attack", "Shove|DMG"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Links to updated versions of this action in newer sources.
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
</div>

---

## Inline Tags

| Tag                 | Example                   | Use                    |
| ------------------- | ------------------------- | ---------------------- |
| `{@action Name}`    | `{@action Attack}`        | Link to another action |
| `{@spell name}`     | `{@spell fireball}`       | Link to a spell        |
| `{@condition name}` | `{@condition grappled}`   | Link to a condition    |
| `{@status name}`    | `{@status concentration}` | Link to a status       |

---

## Examples

### Example 1: Standard Action (Grapple)

A standard combat action that uses 1 action and references a condition.

```json
{
  "name": "Grapple",
  "source": "PHB",
  "page": 195,
  "time": [{ "number": 1, "unit": "action" }],
  "entries": [
    "When you want to grab a creature or wrestle with it, you can use the Attack action to make a special melee attack, a grapple. If you're able to make multiple attacks with the Attack action, this attack replaces one of them.",
    "The target of your grapple must be no more than one size larger than you and must be within your reach. Using at least one free hand, you try to seize the target by making a grapple check instead of an attack roll: a Strength (Athletics) check contested by the target's Strength (Athletics) or Dexterity (Acrobatics) check (the target chooses the ability to use).",
    "If you succeed, you subject the target to the {@condition grappled} condition."
  ],
  "seeAlsoAction": ["Shove", "Shove Aside|DMG"]
}
```

### Example 2: Action with Nested Entries (Attack)

A complex action using nested headers and text to outline detailed rules.

```json
{
  "name": "Attack",
  "source": "XPHB",
  "page": 361,
  "time": [{ "number": 1, "unit": "action" }],
  "entries": [
    "When you take the Attack action, you can make one attack roll with a weapon or an {@variantrule Unarmed Strike|XPHB}.",
    {
      "type": "entries",
      "entries": [
        {
          "type": "entries",
          "name": "Equipping and Unequipping Weapons",
          "entries": [
            "You can either equip or unequip one weapon when you make an attack as part of this action."
          ]
        }
      ]
    }
  ],
  "seeAlsoAction": ["Two-Weapon Fighting|XPHB"]
}
```

### Example 3: Reaction Action (Opportunity Attack)

An action triggered as a reaction to a specific combat event.

```json
{
  "name": "Opportunity Attack",
  "source": "PHB",
  "page": 195,
  "time": [{ "number": 1, "unit": "reaction" }],
  "entries": [
    "You can make an opportunity attack when a hostile creature that you can see moves out of your reach. To make the opportunity attack, you use your reaction to make one melee attack against the provoking creature. The attack occurs right before the creature leaves your reach."
  ]
}
```

---

## Foundry VTT

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryImg</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Icon image path for Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundrySystem</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Override dnd5e system fields in Foundry VTT.</div>
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
    <div class="prop-card-val">Active effects applied in Foundry VTT.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryActivities</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Foundry VTT dnd5e v4+ activity configurations.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryAdvice</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Advice entry rendered for the Foundry importer.</div>
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

## Schema Reference

Actions are validated against `5etools-utils/schema/brew/actions.json`.
