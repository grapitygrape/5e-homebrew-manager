# Additional Spells Reference `additionalSpells`

`additionalSpells` is one shared schema definition
(`util-additionalspells.json#/$defs/additionalSpellsArray`) used by every feature
that hands a character spells — **ancestries**, **backgrounds**, **feats**,
**optional features**, and class/subclass features. This page describes the whole
structure once, so the per-entity guides can link here.

It exists for VTT import. It does **not** replace `classSpells` /
`subclassSpells` / `subSubclassSpells`, which are what drive the references shown
on the site — write both.

---

## The shape, top down

`additionalSpells` is an array of **groups**. Four nesting levels:

```
additionalSpells        [ group, group, … ]
  └─ group              { name, ability, resourceName, innate|known|prepared|expanded }
      └─ category       keyed by character level ("1", "5") or spell level ("s1", "s3")
          └─ recharge   { will, rest, daily, resource, limited, ritual, _ }
              └─ uses   { "1", "2e", "pb", … } → [ spell, spell, … ]
```

The two middle levels can be collapsed: where a category maps straight to a spell
array, the recharge level is skipped and the spells are simply known.

---

## Group keys

<table>
  <thead><tr><th>Key</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Display name for the group, when the feature grants several distinct sets.</td></tr>
    <tr><td><code>ability</code></td><td>string | object</td><td>The spellcasting ability. An abbreviation (<code>"int"</code>, <code>"wis"</code>, <code>"cha"</code>, …), the string <code>"inherit"</code> when it should match a choice the player already made, or <code>{ "choose": ["int", "wis", "cha"] }</code>.</td></tr>
    <tr><td><code>resourceName</code></td><td>string</td><td>What the resource is called, for spells filed under <code>resource</code> — e.g. <code>"Ki"</code>, <code>"Sorcery Point"</code>.</td></tr>
    <tr><td><code>innate</code></td><td>object</td><td>Castable without spending normal spell slots.</td></tr>
    <tr><td><code>known</code></td><td>object</td><td>Always known.</td></tr>
    <tr><td><code>prepared</code></td><td>object</td><td>Always prepared.</td></tr>
    <tr><td><code>expanded</code></td><td>object</td><td>Added to a class's spell list to be chosen from — Warlock patron spells and the like. Not automatically known.</td></tr>
  </tbody>
</table>

At least one of `innate` / `known` / `prepared` / `expanded` is needed for the
group to do anything.

---

## Category keys — when the spells arrive

Inside `innate`, `known`, `prepared` and `expanded`, keys are levels:

- **`"1"`, `"3"`, `"5"`…** — character or class level. The spells become available at that level.
- **`"s1"`, `"s2"`…** — _spell_ level. The spells unlock once the character can actually cast at that level, rather than at a fixed character level. This is the Eberron dragonmark pattern.
- **`"_"`** — no level gating at all; available immediately.

```json
"additionalSpells": [{ "ability": "cha", "known": { "1": ["light#c"], "3": ["misty step"] } }]
```

### Spell strings

A spell entry is a name string, or a filter object:

- `"fireball"` — by name.
- `"light#c"` — the `#c` suffix marks it as a cantrip.
- `"fireball|XPHB"` — pinned to a source.
- `{ "all": "level=0|class=Wizard" }` — every spell matching the filter is granted.
- `{ "choose": "level=0|class=Wizard" }` — the player picks one from the filter.

---

## Recharge keys — how often they can be cast

Where a category needs more than "simply known", its value is an object:

<table>
  <thead><tr><th>Key</th><th>Recharge</th></tr></thead>
  <tbody>
    <tr><td><code>will</code></td><td>At will. Value is a spell array.</td></tr>
    <tr><td><code>ritual</code></td><td>As a ritual only. Value is a spell array.</td></tr>
    <tr><td><code>rest</code></td><td>Short or long rest. Value is a uses object.</td></tr>
    <tr><td><code>daily</code></td><td>Long rest. Value is a uses object.</td></tr>
    <tr><td><code>resource</code></td><td>Costs a named resource (see <code>resourceName</code>), otherwise unrestricted. Uses object.</td></tr>
    <tr><td><code>limited</code></td><td>A fixed number of uses that never recharge. Uses object.</td></tr>
    <tr><td><code>_</code></td><td>None of the above — simply known. Value is a spell array.</td></tr>
  </tbody>
</table>

No other keys are accepted at this level.

---

## Uses keys — how many casts

Inside `rest`, `daily`, `resource` and `limited`, the keys say how many uses each
spell gets:

<table>
  <thead><tr><th>Key</th><th>Meaning</th></tr></thead>
  <tbody>
    <tr><td><code>"1"</code>, <code>"2"</code>, … <code>"99"</code></td><td>That many uses, shared across the listed spells.</td></tr>
    <tr><td><code>"1e"</code>, <code>"2e"</code>, …</td><td>That many uses <strong>each</strong> — the <code>e</code> suffix is the difference between one casting total and one casting per spell.</td></tr>
    <tr><td><code>"pb"</code></td><td>Uses equal to proficiency bonus.</td></tr>
    <tr><td><code>"pbe"</code></td><td>Proficiency bonus uses <strong>each</strong>.</td></tr>
    <tr><td><code>"halfPb"</code></td><td>Half proficiency bonus, rounded up.</td></tr>
    <tr><td><code>"halfPbe"</code></td><td>Half proficiency bonus, each.</td></tr>
    <tr><td><code>"str"</code>, <code>"dex"</code>, <code>"con"</code>, <code>"int"</code>, <code>"wis"</code>, <code>"cha"</code></td><td>Uses equal to that ability's modifier.</td></tr>
    <tr><td><code>"mod"</code></td><td>Uses equal to the group's own spellcasting ability modifier.</td></tr>
  </tbody>
</table>

```json
"additionalSpells": [
  {
    "name": "Drakewarden Spells",
    "ability": "wis",
    "resourceName": "Ki",
    "innate": {
      "3": { "daily": { "1e": ["fog cloud", "thunderwave"] } },
      "5": { "rest": { "pb": ["fly"] } },
      "s3": { "will": ["fireball"] }
    },
    "expanded": { "1": ["burning hands"] }
  }
]
```

---

## Common mistakes

- **Confusing `"1"` with `"1e"`.** `"1"` is one casting shared by every spell listed; `"1e"` is one casting of each.
- **Confusing character level with spell level.** `"3"` means 3rd character level; `"s3"` means "once they can cast 3rd-level spells."
- **Using `expanded` for granted spells.** `expanded` only widens the list to choose from. Use `known` or `prepared` for spells the character actually gets.
- **`resource` without `resourceName`.** The resource has no label to display.
- **Forgetting `classSpells`.** `additionalSpells` feeds VTT import; the site's own references come from the `classSpells` family.
