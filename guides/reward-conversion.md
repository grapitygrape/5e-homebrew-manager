# Rewards `reward`

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
  "reward": [ ... ]
}
```

---

## What is a reward?

A **reward** is a supernatural gift a character receives rather than buys or finds — a blessing, a boon, a charm, a curse, a piety trait. It is not an item: it has no weight, value, or attunement, only a `type` classifier and its rules text. `name`, `source`, `type`, and `entries` are required.

---

## Property Reference

### Required

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">The reward's display name, e.g. <code>"Blessing of Wound Closure"</code>.</div>
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
      <code>type</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      The reward category. Official values are <code>"Blessing"</code>, <code>"Boon"</code>, <code>"Charm"</code>, <code>"Curse"</code>, <code>"Draconic Gift"</code>, <code>"Inhabitation"</code>, <code>"Fragment of Suffering"</code>, <code>"Other"</code>, <code>"Piety Trait"</code>. In homebrew these are <em>examples</em> rather than a closed enum, so a custom type validates — but stick to the official list unless you have a reason not to, since the UI groups and filters on it.
      <pre><code class="language-json">"type": "Blessing"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">The reward's rules text. Items must be unique.</div>
  </div>
</div>

### Optional

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>page</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Page number in the source.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>rarity</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Rarity, for boons that carry one. One of: <span class="schema-enum" data-enum="rarity"><code>"rare"</code>, <code>"uncommon"</code>, <code>"very rare"</code>, <code>"legendary"</code>, <code>"artifact"</code>, <code>"common"</code></span> (<code>"none"</code> and <code>"unknown"</code> are item-only and fail here).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>abilityEntry</code>
      <span class="prop-type">entry</span>
    </div>
    <div class="prop-card-val">
      An ability-score change granted by the reward, written as a single entry (a string or any entry object). This replaces the old <code>ability: { "entry": … }</code> wrapper, which no longer validates.
      <pre><code class="language-json">"abilityEntry": "Your Strength score increases by 2, to a maximum of 22."</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalSpells</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Spells granted by the reward. Same structure used by feats, subclasses, and races — see <a href="additionalspells-reference.md">additionalspells reference</a>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>seeAlsoFacility</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      UIDs of bastion facilities to link in a "See Also" footnote. Array of strings of the form <code>"name|source"</code>, at least one item, no duplicates.
      <pre><code class="language-json">"seeAlsoFacility": ["arcane study|xdmg"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> when a matching <code>rewardFluff</code> entry exists.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluffImages</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> when the matching fluff entry carries images.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>legacy</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">When present it must be <code>true</code>. Marks pre-errata/legacy content.</div>
  </div>
</div>

---

## Complete Property Index

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Reward name (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>type</code></td><td>string</td><td>Reward category (required) — <code>"Blessing"</code>, <code>"Boon"</code>, <code>"Charm"</code>, <code>"Curse"</code>, <code>"Draconic Gift"</code>, <code>"Inhabitation"</code>, <code>"Fragment of Suffering"</code>, <code>"Other"</code>, <code>"Piety Trait"</code>; open-ended in homebrew.</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Rules text (required). Items must be unique.</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Other books in which the reward is also printed.</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Other books which reference the reward.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this entry. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>).</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>rarity</code></td><td>string</td><td>Standard rarity value.</td></tr>
    <tr><td><code>abilityEntry</code></td><td>entry</td><td>Ability-score change, as a single entry.</td></tr>
    <tr><td><code>additionalSpells</code></td><td>array</td><td>Granted spells — see <a href="additionalspells-reference.md">additionalspells reference</a>.</td></tr>
    <tr><td><code>seeAlsoFacility</code></td><td>array</td><td>Facility UID strings linked as a "See Also" footnote (at least one, unique).</td></tr>
    <tr><td><code>hasFluff</code></td><td>boolean</td><td>Presence flag for a matching <code>rewardFluff</code> entry.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td>boolean</td><td>Presence flag for fluff images.</td></tr>
    <tr><td><code>foundrySystem</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>foundryActivities</code></td><td>array</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>foundryFlags</code></td><td>object</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>foundryEffects</code></td><td>array</td><td>Foundry VTT integration field.</td></tr>
    <tr><td><code>foundryImg</code></td><td>string</td><td>Foundry icon path.</td></tr>
    <tr><td><code>foundryAdvice</code></td><td>object</td><td>Advice entry rendered for the Foundry importer.</td></tr>
    <tr><td><code>_foundryMerge</code></td><td>object</td><td>Foundry merge directive.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another reward, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
  </tbody>
</table>

The reward object is closed (`additionalProperties: false`) — an unrecognised key is a validation error, not a silently ignored field.

---

## Examples

### Example 1: Simple blessing

```json
{
  "name": "Blessing of the Ember Hearth",
  "source": "MyBrew",
  "page": 88,
  "type": "Blessing",
  "entries": [
    "You have resistance to cold damage, and you can end the {@condition prone} condition on yourself as a bonus action."
  ]
}
```

### Example 2: Boon granting spells and linking a facility

```json
{
  "name": "Boon of the Sanctum",
  "source": "MyBrew",
  "type": "Boon",
  "rarity": "legendary",
  "entries": [
    "While you maintain a bastion containing an Arcane Study, your studies bear strange fruit."
  ],
  "additionalSpells": [
    {
      "innate": {
        "_": {
          "daily": {
            "1e": ["identify"]
          }
        }
      }
    }
  ],
  "seeAlsoFacility": ["arcane study|xdmg"],
  "hasFluff": true
}
```

---

## Fluff

Reward fluff lives in a separate `rewardFluff` array, matched by `name` + `source`. Set `hasFluff` (and `hasFluffImages`, if applicable) on the reward so the UI knows to look for it.

```json
{
  "reward": [{ "name": "Boon of the Sanctum", "source": "MyBrew", "type": "Boon", "entries": ["..."], "hasFluff": true }],
  "rewardFluff": [{ "name": "Boon of the Sanctum", "source": "MyBrew", "entries": ["..."] }]
}
```

---

## Common Mistakes

1. **Omitting `type`.** Unlike most homebrew types, `type` is required alongside `name`, `source`, and `entries`.
2. **Duplicate items in `entries`.** The array is `uniqueItems` — two identical strings fail validation.
3. **Using the old `ability: { "entry": … }` wrapper.** Since rewards schema v1.4.0 the entry goes straight into `abilityEntry`.
4. **`seeAlsoFacility` as a plain name.** Use full UIDs (`"name|source"`), and give at least one, with no duplicates.
5. **Setting `hasFluff` with no matching `rewardFluff` entry.** The flag is a hint to the UI, not a declaration — it must be backed by real fluff.

---

## Schema References

- **Reward schema:** `5etools-utils/schema/brew/rewards.json` (`schema-template/rewards.json`, v1.4.0) — `#/$defs/reward`.
- **Reward fluff:** `5etools-utils/schema/brew/fluff-rewards.json`
- **Additional spells:** [additionalspells-reference.md](additionalspells-reference.md)
- **`_meta` block:** [meta.md](meta.md)
- **Copy / inheritance:** [Spec_Copy.md](Spec_Copy.md)
