# Monsters `monster`

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
  "monster": [ ... ]
}
```

---

## What is a monster?

A **monster** entry is a full **stat block** — everything from a rat to a demon lord. It is the richest entity in the schema: identity and typing, the six ability scores, AC/HP/speed, saves and skills, senses and languages, damage/condition defenses, challenge rating, and the ordered feature sections (traits, actions, bonus actions, reactions, legendary and mythic actions, spellcasting), plus a large tail of index tags and VTT integration fields.

Only <code>name</code> and <code>source</code> are strictly required by the schema, but a usable stat block needs at least <code>size</code>, <code>type</code>, <code>alignment</code>, ability scores, <code>ac</code>, <code>hp</code>, and <code>cr</code>. Feature sections are arrays of <code>{ name, entries }</code> objects; the <code>entries</code> use the standard entry format with <code>{@…}</code> inline tags.

> The tables below list only the **top-level** properties of a creature. The structure _inside_ rich fields (an <code>action</code>'s <code>entries</code>, an <code>ac</code> object's <code>from</code>, a <code>spellcasting</code> block) is validated separately and follows the shapes shown in the examples.

---

## Property Reference

### Core identity & rating

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>name</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Creature name (required).</div>
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
      <code>size</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Size code(s): <span class="schema-enum" data-enum="sizes"><code>"F"</code> Fine · <code>"D"</code> Diminutive · <code>"T"</code> Tiny · <code>"S"</code> Small · <code>"M"</code> Medium · <code>"L"</code> Large · <code>"H"</code> Huge · <code>"G"</code> Gargantuan · <code>"C"</code> Colossal · <code>"V"</code> Varies</span>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>type</code>
      <span class="prop-type">string | object</span>
    </div>
    <div class="prop-card-val">Creature type — a string (<code>"dragon"</code>) or object with <code>tags</code>/<code>swarmSize</code>. Set <code>typeHidden: true</code> in the object to leave the type out of the stat block's size-and-type line.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>typeNote</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Text added after the size, type and alignment line. It's rendered, so <code>{@…}</code> tags work. The World of Warcraft druid forms pair it with a hidden <code>"special"</code> type.
      <pre><code class="language-json">"type": { "type": "special", "typeHidden": true },
"typeNote": "(Your Creature Type And Alignment Don't Change. Requires {@subclassFeature Circle Forms|Druid|XPHB|Moon|XPHB|3|XPHB})"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alignment</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Alignment codes, e.g. <code>["C","E"]</code>; supports weighted/choice objects.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>cr</code>
      <span class="prop-type">string | object</span>
    </div>
    <div class="prop-card-val">Challenge rating: <code>"5"</code> or <code>{cr, lair, coven}</code>.</div>
  </div>
</div>

### Ability scores, saves & skills

<div class="prop-cards">
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
      <code>save</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Saving-throw bonuses by ability, e.g. <code>{"dex":"+5"}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>skill</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Skill bonuses, e.g. <code>{"perception":"+4"}</code>. Standard skill names use lowercase keys. Custom or homebrew skills use a UID key: <code>{"gaming set|MySource":"+5"}</code>.</div>
  </div>
</div>

### Defenses & vitals

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>ac</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Armor class: integers and/or objects <code>{ac, from, condition}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hp</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Hit points: <code>{average, formula}</code> or <code>{special}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>speed</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Speeds by mode: <code>{walk, fly, swim, climb, burrow, canHover}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>senses</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Special senses, e.g. <code>["darkvision 60 ft."]</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>passive</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">Passive Perception.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>languages</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Languages known.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>vulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage vulnerabilities.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>resist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage resistances.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>immune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage immunities.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Condition immunities.</div>
  </div>
</div>

### Feature sections

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>trait</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Passive traits — each <code>{name, entries}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>action</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Actions — each <code>{name, entries}</code>.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>bonus</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Bonus actions.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reaction</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Reactions.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellcasting</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Spellcasting trait blocks (innate/prepared/known).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>legendary</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Legendary action entries.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>legendaryGroup</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Link to a shared <code>legendaryGroup</code> (lair actions, regional effects).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>mythic</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Mythic action entries.</div>
  </div>
</div>

---

## Complete Property Index

Every top-level property a `monster` may declare.

<table>
  <thead><tr><th>Property</th><th>Type</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td><code>name</code></td><td>string</td><td>Creature name (required).</td></tr>
    <tr><td><code>shortName</code></td><td>string | boolean</td><td>Short name used in legendary/action headers; <code>true</code> copies the full name.</td></tr>
    <tr><td><code>alias</code></td><td>array</td><td>Alternate names for search.</td></tr>
    <tr><td><code>group</code></td><td>array</td><td>Group membership (e.g. "Demons").</td></tr>
    <tr><td><code>level</code></td><td>integer</td><td>Level, for sidekicks.</td></tr>
    <tr><td><code>size</code></td><td>array</td><td>Size code(s): <span class="schema-enum" data-enum="sizes"><code>"F"</code> Fine · <code>"D"</code> Diminutive · <code>"T"</code> Tiny · <code>"S"</code> Small · <code>"M"</code> Medium · <code>"L"</code> Large · <code>"H"</code> Huge · <code>"G"</code> Gargantuan · <code>"C"</code> Colossal · <code>"V"</code> Varies</span>.</td></tr>
    <tr><td><code>sizeNote</code></td><td>string</td><td>Parenthetical note after size.</td></tr>
    <tr><td><code>type</code></td><td>string | object</td><td>Creature type — a string (<code>"dragon"</code>) or object with <code>tags</code>/<code>swarmSize</code>/<code>typeHidden</code>.</td></tr>
    <tr><td><code>typeNote</code></td><td>string</td><td>Text after the size, type and alignment line; supports <code>{@…}</code> tags.</td></tr>
    <tr><td><code>source</code></td><td>string</td><td>Source identifier — a <code>_meta.sources[].json</code> value (required).</td></tr>
    <tr><td><code>sourceSub</code></td><td>string</td><td>Sub-source label.</td></tr>
    <tr><td><code>otherSources</code></td><td>array</td><td>Additional sources the creature appears in.</td></tr>
    <tr><td><code>reprintedAs</code></td><td>array</td><td>Newer printing(s) that supersede this entry. Each element is either a UID string (<code>"name|source"</code>) or an object with <code>uid</code> (required) plus <code>tag</code> (renderer tag, when the reprint is a different kind of entity) and/or <code>edition</code> (<code>"classic"</code> / <code>"one"</code>). The object form needs at least one key besides <code>uid</code>; no other keys, no duplicates.</td></tr>
    <tr><td><code>alignment</code></td><td>array</td><td>Alignment codes, e.g. <code>["C","E"]</code>; supports weighted/choice objects.</td></tr>
    <tr><td><code>alignmentPrefix</code></td><td>string</td><td>Text prefixed to the alignment line (e.g. "typically ").</td></tr>
    <tr><td><code>ac</code></td><td>array</td><td>Armor class: integers and/or objects <code>{ac, from, condition}</code>.</td></tr>
    <tr><td><code>hp</code></td><td>object</td><td>Hit points: <code>{average, formula}</code> or <code>{special}</code>.</td></tr>
    <tr><td><code>speed</code></td><td>object</td><td>Speeds by mode: <code>{walk, fly, swim, climb, burrow, canHover}</code>.</td></tr>
    <tr><td><code>initiative</code></td><td>object</td><td>Fixed initiative data (2024 stat blocks).</td></tr>
    <tr><td><code>str</code></td><td>integer</td><td>Strength score.</td></tr>
    <tr><td><code>dex</code></td><td>integer</td><td>Dexterity score.</td></tr>
    <tr><td><code>con</code></td><td>integer</td><td>Constitution score.</td></tr>
    <tr><td><code>int</code></td><td>integer</td><td>Intelligence score.</td></tr>
    <tr><td><code>wis</code></td><td>integer</td><td>Wisdom score.</td></tr>
    <tr><td><code>cha</code></td><td>integer</td><td>Charisma score.</td></tr>
    <tr><td><code>save</code></td><td>object</td><td>Saving-throw bonuses by ability, e.g. <code>{"dex":"+5"}</code>.</td></tr>
    <tr><td><code>skill</code></td><td>object</td><td>Skill bonuses. Standard keys: <code>perception</code>, <code>stealth</code>, etc. Custom skills: <code>{"skill name|source":"+N"}</code>.</td></tr>
    <tr><td><code>tool</code></td><td>object</td><td>Tool proficiencies with bonuses.</td></tr>
    <tr><td><code>gear</code></td><td>array</td><td>Carried gear item references.</td></tr>
    <tr><td><code>senses</code></td><td>array</td><td>Special senses, e.g. <code>["darkvision 60 ft."]</code>.</td></tr>
    <tr><td><code>passive</code></td><td>integer</td><td>Passive Perception.</td></tr>
    <tr><td><code>languages</code></td><td>array</td><td>Languages known.</td></tr>
    <tr><td><code>pbNote</code></td><td>string</td><td>Note overriding the displayed proficiency bonus.</td></tr>
    <tr><td><code>cr</code></td><td>string | object</td><td>Challenge rating: <code>"5"</code> or <code>{cr, lair, coven}</code>.</td></tr>
    <tr><td><code>vulnerable</code></td><td>array</td><td>Damage vulnerabilities.</td></tr>
    <tr><td><code>resist</code></td><td>array</td><td>Damage resistances.</td></tr>
    <tr><td><code>immune</code></td><td>array</td><td>Damage immunities.</td></tr>
    <tr><td><code>conditionImmune</code></td><td>array</td><td>Condition immunities.</td></tr>
    <tr><td><code>spellcasting</code></td><td>array</td><td>Spellcasting trait blocks (innate/prepared/known).</td></tr>
    <tr><td><code>trait</code></td><td>array</td><td>Passive traits — each <code>{name, entries}</code>.</td></tr>
    <tr><td><code>actionNote</code></td><td>string</td><td>Explanatory note shown under that section.</td></tr>
    <tr><td><code>actionHeader</code></td><td>string</td><td>Custom header text for that section.</td></tr>
    <tr><td><code>action</code></td><td>array</td><td>Actions — each <code>{name, entries}</code>.</td></tr>
    <tr><td><code>bonusNote</code></td><td>string</td><td>Explanatory note shown under that section.</td></tr>
    <tr><td><code>bonusHeader</code></td><td>string</td><td>Custom header text for that section.</td></tr>
    <tr><td><code>bonus</code></td><td>array</td><td>Bonus actions.</td></tr>
    <tr><td><code>reactionNote</code></td><td>string</td><td>Explanatory note shown under that section.</td></tr>
    <tr><td><code>reactionHeader</code></td><td>string</td><td>Custom header text for that section.</td></tr>
    <tr><td><code>reaction</code></td><td>array</td><td>Reactions.</td></tr>
    <tr><td><code>legendaryGroup</code></td><td>object</td><td>Link to a shared <code>legendaryGroup</code> (lair actions, regional effects).</td></tr>
    <tr><td><code>legendaryActions</code></td><td>integer</td><td>Number of legendary actions per round (default 3).</td></tr>
    <tr><td><code>legendaryActionsLair</code></td><td>integer</td><td>Legendary actions available while in the lair.</td></tr>
    <tr><td><code>legendaryHeader</code></td><td>string</td><td>Custom header text for that section.</td></tr>
    <tr><td><code>legendary</code></td><td>array</td><td>Legendary action entries.</td></tr>
    <tr><td><code>mythicHeader</code></td><td>string</td><td>Custom header text for that section.</td></tr>
    <tr><td><code>mythic</code></td><td>array</td><td>Mythic action entries.</td></tr>
    <tr><td><code>variant</code></td><td>array</td><td>Inline variant/sidebar blocks.</td></tr>
    <tr><td><code>page</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>familiar</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>additionalSources</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>hasToken</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>tokenCredit</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryTokenScale</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>altArt</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>token</code></td><td>object</td><td>Token image reference.</td></tr>
    <tr><td><code>isNamedCreature</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>isNpc</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>environment</code></td><td>array</td><td>Environments the creature inhabits.</td></tr>
    <tr><td><code>treasure</code></td><td>array</td><td>Treasure tags.</td></tr>
    <tr><td><code>soundClip</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>dragonCastingColor</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>dragonAge</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>traitTags</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>actionTags</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>languageTags</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>senseTags</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>spellcastingTags</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>damageTags</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>damageTagsSpell</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>damageTagsLegendary</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>miscTags</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>attachedItems</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>conditionInflict</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>conditionInflictLegendary</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>conditionInflictSpell</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>savingThrowForced</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>savingThrowForcedLegendary</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>savingThrowForcedSpell</code></td><td>array</td><td>Filter/index tag list (generated or hand-authored).</td></tr>
    <tr><td><code>footer</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>legacy</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>summonedBySpell</code></td><td>varies</td><td>Summoning scaling metadata.</td></tr>
    <tr><td><code>summonedBySpellLevel</code></td><td>varies</td><td>Summoning scaling metadata.</td></tr>
    <tr><td><code>summonedByClass</code></td><td>varies</td><td>Summoning scaling metadata.</td></tr>
    <tr><td><code>summonedScaleByPlayerLevel</code></td><td>varies</td><td>Summoning scaling metadata.</td></tr>
    <tr><td><code>_isCopy</code></td><td>boolean</td><td>Engine annotation marking a copy-resolved creature.</td></tr>
    <tr><td><code>_versions</code></td><td>array</td><td>Generated variant versions of this creature.</td></tr>
    <tr><td><code>hasFluff</code></td><td>boolean</td><td>Presence flag.</td></tr>
    <tr><td><code>hasFluffImages</code></td><td>boolean</td><td>Presence flag.</td></tr>
    <tr><td><code>externalSources</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>resource</code></td><td>varies</td><td>See the bestiary schema for structure.</td></tr>
    <tr><td><code>fluff</code></td><td>object</td><td>Inline lore/description and images.</td></tr>
    <tr><td><code>foundryImg</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryPrototypeToken</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>tokenUrl</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>tokenHref</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryTokenSubjectHref</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>foundryTokenSubjectScale</code></td><td>string</td><td>Foundry VTT / token integration field.</td></tr>
    <tr><td><code>_copy</code></td><td>object</td><td>Inherit from another creature, then override. See the <a href="Spec_Copy.md">Copy spec</a> for every <code>_copy</code> key — <code>_mod</code>, <code>_templates</code>, <code>_preserve</code>, and the identity keys (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>).</td></tr>
    <tr><td><code>foundryAdvice</code></td><td>object</td><td>Advice entry rendered for the Foundry importer.</td></tr>
    <tr><td><code>isReprinted</code></td><td>boolean</td><td>Deprecated marker for a superseded entry — prefer <code>reprintedAs</code> where available.</td></tr>
    <tr><td><code>referenceSources</code></td><td>array</td><td>Sources that reference this creature (e.g. in bold text).</td></tr>
    <tr><td><code>tokenCustom</code></td><td>boolean</td><td>Foundry VTT / token integration field. Always <code>true</code> when present.</td></tr>
    <tr><td><code>tokenHref3d</code></td><td>object</td><td>Foundry VTT / token integration field — href for a 3D token.</td></tr>
  </tbody>
</table>
