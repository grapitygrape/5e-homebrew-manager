# Vehicles `vehicle`

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
  "vehicle": [ ... ]
}
```

---

## What is a vehicle?

A **vehicle** is a ship, spelljammer, infernal war machine, mount-like creature, or large object that a party crews or rides. The one array holds all five kinds; the <code>vehicleType</code> field selects which set of fields is meaningful:

- **<code>"SHIP"</code>** — sailing/rowing ships. Uses component sections: <code>hull</code>, <code>control</code>, <code>movement</code>, <code>weapon</code>, plus <code>actionThresholds</code>, <code>initiative</code>, and ability scores.
- **<code>"SPELLJAMMER"</code>** — spelljamming ships. Uses <code>speed</code>, <code>pace</code>, <code>hull</code>, <code>cost</code>, and <code>weapon</code>.
- **<code>"INFWAR"</code>** — infernal war machines. A creature-like block: <code>ac</code>, <code>hp</code>, ability scores, <code>actionStation</code>, <code>reaction</code>, <code>trait</code>.
- **<code>"CREATURE"</code> / <code>"OBJECT"</code>** — marker types for creature- or object-based vehicles; only <code>vehicleType</code> and <code>terrain</code> are constrained.

Only <code>name</code> and <code>source</code> are strictly required. Component and action fields are arrays of objects that follow the same entry conventions as monster actions.

> Vehicle **upgrades** are a separate entity (<code>vehicleUpgrade</code>) — see [vehicle upgrade conversion](vehicleupgrade-conversion.md).

---

## Property Reference

### Required & typing

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Vehicle name (required).</div>
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
      <code>vehicleType</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Sub-type: <code>"SHIP"</code>, <code>"SPELLJAMMER"</code>, <code>"INFWAR"</code> (infernal war machine), <code>"CREATURE"</code>, or <code>"OBJECT"</code>. Determines which fields apply.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>terrain</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Terrain the vehicle operates in: <code>"sea"</code>, <code>"land"</code>, <code>"air"</code>, <code>"space"</code>.</div>
  </div>
</div>

### Size, capacity & movement

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>size</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Size code (<code>"L"</code>, <code>"H"</code>, <code>"G"</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dimensions</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Physical dimensions, e.g. <code>["100 ft.", "20 ft."]</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>capCrew</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Crew capacity.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>capPassenger</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Passenger capacity.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>capCargo</code>
      <span class="prop-type">number</span>
    </div>
    <div class="prop-card-val">Cargo capacity in tons.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>pace</code>
      <span class="prop-type">integer | object</span>
    </div>
    <div class="prop-card-val">Travel pace (ships/spelljammers); object form gives per-mode paces.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>speed</code>
      <span class="prop-type">integer | object</span>
    </div>
    <div class="prop-card-val">Combat speed in feet (spelljammers, war machines).</div>
  </div>
</div>

### Ship components (SHIP / SPELLJAMMER)

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hull</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Hull component: <code>{ac, hp}</code> (and thresholds).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>control</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Control components (helm, etc.): each <code>{name, ac, hp, entries}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>movement</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Movement components (sails, oars): each <code>{name, ac, hp, locomotion, speed}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>weapon</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Weapon components: each <code>{name, count, ac, hp, entries}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>actionThresholds</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Mishap/damage thresholds that reduce a ship's actions.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>initiative</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Fixed initiative modifier for <code>"SHIP"</code> vehicles (used by the initiative tracker).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>actionStation</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Crewed action stations (infernal war machines).</div>
  </div>
</div>

### Stat block (INFWAR) & shared

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ac</code>
      <span class="prop-type">integer | object</span>
    </div>
    <div class="prop-card-val">Armor class (infernal war machines).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hp</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Hit points (infernal war machines): <code>{average, formula}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>str</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Strength score.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>dex</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Dexterity score.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>con</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Constitution score.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>int</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Intelligence score.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>wis</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Wisdom score.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>cha</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Charisma score.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>action</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Ship-wide actions — each <code>{name, entries}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>trait</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Passive traits — each <code>{name, entries}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reaction</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Reactions.</div>
  </div>
</div>

---

## Complete Property Index

Every top-level property a `vehicle` may declare across all five `vehicleType`s.

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Vehicle name (required).</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>page</code></td><td>integer</td><td>Page number in the source.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Additional sources the vehicle appears in.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this entry. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> (renderer tag, when the reprint is a different kind of entity) and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>). The object form needs at least one key besides <code>uid</code>; no other keys, no duplicates.</td></tr>
    <tr><td><code>legacy</code></td><td>boolean</td><td>Marks pre-errata/legacy content.</td></tr>
    <tr><td><code>vehicleType</code></td><td>string</td><td>Sub-type: <code>"SHIP"</code>, <code>"SPELLJAMMER"</code>, <code>"INFWAR"</code> (infernal war machine), <code>"CREATURE"</code>, or <code>"OBJECT"</code>. Determines which fields apply.</td></tr>
    <tr><td><code>terrain</code></td><td>array</td><td>Terrain the vehicle operates in: <code>"sea"</code>, <code>"land"</code>, <code>"air"</code>, <code>"space"</code>.</td></tr>
    <tr><td><code>size</code></td><td>string</td><td>Size code (<code>"L"</code>, <code>"H"</code>, <code>"G"</code>).</td></tr>
    <tr><td><code>dimensions</code></td><td>array</td><td>Physical dimensions, e.g. <code>["100 ft.", "20 ft."]</code>.</td></tr>
    <tr><td><code>capCrew</code></td><td>integer</td><td>Crew capacity.</td></tr>
    <tr><td><code>capCrewNote</code></td><td>string</td><td>Note qualifying crew capacity.</td></tr>
    <tr><td><code>capPassenger</code></td><td>integer</td><td>Passenger capacity.</td></tr>
    <tr><td><code>capCargo</code></td><td>number</td><td>Cargo capacity in tons.</td></tr>
    <tr><td><code>capCreature</code></td><td>integer</td><td>Creature capacity (infernal war machines).</td></tr>
    <tr><td><code>pace</code></td><td>integer | object</td><td>Travel pace (ships/spelljammers); object form gives per-mode paces.</td></tr>
    <tr><td><code>speed</code></td><td>integer | object</td><td>Combat speed in feet (spelljammers, war machines).</td></tr>
    <tr><td><code>weight</code></td><td>integer</td><td>Weight in pounds (infernal war machines).</td></tr>
    <tr><td><code>str</code></td><td>integer</td><td>Strength score.</td></tr>
    <tr><td><code>dex</code></td><td>integer</td><td>Dexterity score.</td></tr>
    <tr><td><code>con</code></td><td>integer</td><td>Constitution score.</td></tr>
    <tr><td><code>int</code></td><td>integer</td><td>Intelligence score.</td></tr>
    <tr><td><code>wis</code></td><td>integer</td><td>Wisdom score.</td></tr>
    <tr><td><code>cha</code></td><td>integer</td><td>Charisma score.</td></tr>
    <tr><td><code>hp</code></td><td>object</td><td>Hit points (infernal war machines): <code>{average, formula}</code>.</td></tr>
    <tr><td><code>ac</code></td><td>integer | object</td><td>Armor class (infernal war machines).</td></tr>
    <tr><td><code>resist</code></td><td>array</td><td>Damage resistances.</td></tr>
    <tr><td><code>conditionImmune</code></td><td>array</td><td>Condition immunities.</td></tr>
    <tr><td><code>immune</code></td><td>array</td><td>Damage immunities.</td></tr>
    <tr><td><code>vulnerable</code></td><td>array</td><td>Damage vulnerabilities.</td></tr>
    <tr><td><code>actionThresholds</code></td><td>object</td><td>Mishap/damage thresholds that reduce a ship's actions.</td></tr>
    <tr><td><code>initiative</code></td><td>integer</td><td>Fixed initiative modifier (<code>"SHIP"</code> vehicles).</td></tr>
    <tr><td><code>action</code></td><td>array</td><td>Ship-wide actions — each <code>{name, entries}</code>.</td></tr>
    <tr><td><code>actionStation</code></td><td>array</td><td>Crewed action stations (infernal war machines).</td></tr>
    <tr><td><code>reaction</code></td><td>array</td><td>Reactions.</td></tr>
    <tr><td><code>hull</code></td><td>object</td><td>Hull component: <code>{ac, hp}</code> (and thresholds).</td></tr>
    <tr><td><code>control</code></td><td>array</td><td>Control components (helm, etc.): each <code>{name, ac, hp, entries}</code>.</td></tr>
    <tr><td><code>movement</code></td><td>array</td><td>Movement components (sails, oars): each <code>{name, ac, hp, locomotion, speed}</code>.</td></tr>
    <tr><td><code>weapon</code></td><td>array</td><td>Weapon components: each <code>{name, count, ac, hp, entries}</code>.</td></tr>
    <tr><td><code>cost</code></td><td>integer | object</td><td>Purchase cost (spelljammers).</td></tr>
    <tr><td><code>other</code></td><td>array</td><td>Miscellaneous component/section entries.</td></tr>
    <tr><td><code>trait</code></td><td>array</td><td>Passive traits — each <code>{name, entries}</code>.</td></tr>
    <tr><td><code>token</code></td><td>object</td><td>Token image reference.</td></tr>
    <tr><td><code>tokenCredit</code></td><td>string</td><td>Artist credit for the token.</td></tr>
    <tr><td><code>hasToken</code></td><td>boolean</td><td>Whether a token image exists.</td></tr>
    <tr><td><code>hasFluff</code></td><td>boolean</td><td>Has associated fluff entries.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td>boolean</td><td>Has associated fluff images.</td></tr>
    <tr><td><code>fluff</code></td><td>object</td><td>Inline lore/description and images.</td></tr>
    <tr><td><code>foundryTokenScale</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundrySystem</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryActivities</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryFlags</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryImg</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>tokenUrl</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>tokenHref</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryTokenSubjectHref</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryTokenSubjectScale</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another vehicle, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>_versions</code></td><td>array</td><td>Generates several vehicle variants from one definition (<code>"CREATURE"</code> vehicles). See the <a href="Spec_Copy.md">Copy spec</a> for both forms — the explicit variant list, and the <code>_abstract</code> / <code>_implementations</code> template form with its <code>_variables</code> substitutions.</td></tr>
    <tr><td><code>foundryAdvice</code></td><td>object</td><td>Advice entry rendered for the Foundry importer.</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Sources that reference this vehicle (e.g. in bold text).</td></tr>
    <tr><td><code>tokenCustom</code></td><td>boolean</td><td>Foundry VTT / token integration field. Always <code>true</code> when present.</td></tr>
    <tr><td><code>tokenHref3d</code></td><td>object</td><td>Foundry VTT / token integration field — href for a 3D token.</td></tr>
    <tr><td><code>station</code></td><td>array</td><td>Crew stations (elemental airship). Each entry describes a post and its actions.</td></tr>
    <tr><td><code>objectType</code></td><td>string</td><td>Object classification code (object vehicles, e.g. siege equipment).</td></tr>
    <tr><td><code>creatureType</code></td><td>array</td><td>Creature type the object counts as, where applicable.</td></tr>
    <tr><td><code>entries</code></td><td>array</td><td>Description text.</td></tr>
    <tr><td><code>actionEntries</code></td><td>array</td><td>Action entries available to the object.</td></tr>
  </tbody>
</table>
