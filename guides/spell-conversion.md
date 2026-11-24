# Spells `spell`

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
  "spell": [ ... ]
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
    <div class="prop-card-val">The spell's display name.</div>
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
      <code>level</code>
      <span class="prop-type">integer</span>
    </div>
    <div class="prop-card-val">
      Spell level. <code>0</code> for cantrips, <code>1</code>–<code>9</code> for levelled spells.
      <pre><code class="language-json">"level": 2</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>school</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">
      Single-letter school code: <code>A</code> Abjuration · <code>C</code> Conjuration · <code>D</code> Divination · <code>E</code> Enchantment · <code>I</code> Illusion · <code>N</code> Necromancy · <code>T</code> Transmutation · <code>V</code> Evocation · <code>P</code> Psionic.
      <pre><code class="language-json">"school": "V"</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>time</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Casting time(s). Each element is an object with:
      <ul>
        <li><code>number</code> — integer quantity</li>
        <li><code>unit</code> — <code>"action"</code>, <code>"bonus"</code>, <code>"reaction"</code>, <code>"minute"</code>, <code>"hour"</code>, <code>"day"</code>, <code>"special"</code></li>
        <li><code>condition</code> — string, optional; text after "reaction, which you take when…"</li>
      </ul>
      <pre><code class="language-json">"time": [{ "number": 1, "unit": "action" }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>range</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Spell range. Keys:
      <ul>
        <li><code>type</code> — <code>"point"</code>, <code>"line"</code>, <code>"cube"</code>, <code>"cone"</code>, <code>"sphere"</code>, <code>"hemisphere"</code>, <code>"cylinder"</code>, <code>"radius"</code>, <code>"emanation"</code>, <code>"special"</code></li>
        <li><code>distance</code> — object with:
          <ul>
            <li><code>type</code> — <code>"feet"</code>, <code>"miles"</code>, <code>"self"</code>, <code>"touch"</code>, <code>"sight"</code>, <code>"unlimited"</code></li>
            <li><code>amount</code> — integer</li>
            <li><code>amountSecondary</code> / <code>typeSecondary</code> — optional, for composite ranges</li>
          </ul>
        </li>
      </ul>
      <pre><code class="language-json">"range": {
  "type": "point",
  "distance": { "type": "feet", "amount": 60 }
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>components</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Spell components. Boolean keys for <code>v</code> (Verbal), <code>s</code> (Somatic), <code>r</code> (Royalty). For material components, <code>m</code> is either <code>true</code> or an object with:
      <ul>
        <li><code>text</code> — description of the material</li>
        <li><code>cost</code> — integer value in copper pieces</li>
        <li><code>consume</code> — <code>true</code> if consumed on casting</li>
      </ul>
      <pre><code class="language-json">"components": {
  "v": true,
  "s": true,
  "m": { "text": "a diamond worth 100gp", "cost": 10000 }
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>duration</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Duration(s). Each element is an object with:
      <ul>
        <li><code>type</code> — <code>"instant"</code>, <code>"timed"</code>, <code>"permanent"</code>, <code>"special"</code></li>
        <li><code>duration</code> — object for <code>"timed"</code>: <code>{ "type": "round"|"minute"|"hour"|"day", "amount": N, "upTo": true }</code></li>
        <li><code>concentration</code> — <code>true</code> if concentration required</li>
        <li><code>ends</code> — array of strings describing termination conditions</li>
      </ul>
      <pre><code class="language-json">"duration": [{
  "type": "timed",
  "duration": { "type": "minute", "amount": 1, "upTo": true },
  "concentration": true
}]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entries</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Spell description. Can include strings, entry objects, and tables. See <a href="classfeature-conversion.md">classfeature-conversion.md</a> for entry types.</div>
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
      <code>meta</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Special spell tags. Boolean fields:
      <ul>
        <li><code>ritual</code> — the spell can be cast as a ritual</li>
        <li><code>technomagic</code> — tagged as technomagic (used in some UA/settings content)</li>
      </ul>
      <pre><code class="language-json">"meta": { "ritual": true }</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>entriesHigherLevel</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Upcast description. Typically a single entry object with <code>type: "entries"</code>, name <code>"At Higher Levels"</code>, and an <code>entries</code> array.
      <pre><code class="language-json">"entriesHigherLevel": [{
  "type": "entries",
  "name": "At Higher Levels",
  "entries": ["When you cast this spell using a slot of 3rd level or higher..."]
}]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>subschools</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Spell sub-school tags (e.g. <code>["healing"]</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>alias</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Alternate names for this spell, used for search.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>otherSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Additional sources that print this spell.
      <pre><code class="language-json">"otherSources": [{ "source": "XGE", "page": 152 }]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>reprintedAs</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">UIDs of newer printings that supersede this entry.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>legacy</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Marks this as legacy (pre-2024) content when a 2024 version exists.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>additionalSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Additional sources that also contain this spell (used for cross-referencing).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>referenceSources</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Sources which reference this spell (e.g. in bold text).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>roll20Spell</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Roll20 spell data for VTT integration.</div>
  </div>
</div>

### Spell Lists

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>classes</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Class lists this spell belongs to. Object with optional keys:
      <ul>
        <li><code>fromClassList</code> — classes that get the spell on their primary list</li>
        <li><code>fromClassListVariant</code> — classes that get the spell as a variant/optional rule</li>
        <li><code>fromSubclass</code> — subclasses that add the spell</li>
      </ul>
      Each entry is an object with <code>name</code> and <code>source</code> (<code>fromSubclass</code> entries instead take a <code>class</code> object and a <code>subclass</code> object; <code>subclass</code> requires <code>name</code>, <code>shortName</code>, and <code>source</code>).
      <pre><code class="language-json">"classes": {
  "fromClassList": [
    { "name": "Wizard", "source": "PHB" }
  ],
  "fromSubclass": [{
    "class": { "name": "Cleric", "source": "PHB" },
    "subclass": { "name": "Arcana Domain", "shortName": "Arcana", "source": "SCAG" }
  }]
}</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>races</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Races/ancestries that add this spell to their traits.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>backgrounds</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Backgrounds that grant this spell.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>optionalfeatures</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Optional features that grant this spell.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>feats</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Feats that grant this spell.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>groups</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Named spell groups this spell belongs to (e.g. <code>"Druid Circles"</code>).</div>
  </div>
</div>

### Combat & Automation Tags

Tags used by the UI for filtering, damage calculations, and VTT automation. All optional.

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>damageInflict</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Damage types this spell can inflict. Values: <span class="schema-enum" data-enum="damageTypes"><code>"acid"</code>, <code>"bludgeoning"</code>, <code>"cold"</code>, <code>"fire"</code>, <code>"force"</code>, <code>"lightning"</code>, <code>"necrotic"</code>, <code>"piercing"</code>, <code>"poison"</code>, <code>"psychic"</code>, <code>"radiant"</code>, <code>"slashing"</code>, <code>"thunder"</code></span>.
      <pre><code class="language-json">"damageInflict": ["fire", "radiant"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>damageResist</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage types this spell grants resistance to.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>damageImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage types this spell grants immunity to.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>damageVulnerable</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Damage types this spell causes vulnerability to.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionInflict</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Conditions this spell can inflict. Values: <span class="schema-enum" data-enum="conditions"><code>"blinded"</code>, <code>"charmed"</code>, <code>"deafened"</code>, <code>"exhaustion"</code>, <code>"frightened"</code>, <code>"grappled"</code>, <code>"incapacitated"</code>, <code>"invisible"</code>, <code>"paralyzed"</code>, <code>"petrified"</code>, <code>"poisoned"</code>, <code>"prone"</code>, <code>"restrained"</code>, <code>"stunned"</code>, <code>"unconscious"</code></span>.
      <pre><code class="language-json">"conditionInflict": ["paralyzed", "stunned"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>conditionImmune</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Conditions this spell grants immunity to.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>savingThrow</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Ability saves required. Values: <span class="schema-enum" data-enum="savingThrows"><code>"strength"</code>, <code>"constitution"</code>, <code>"dexterity"</code>, <code>"intelligence"</code>, <code>"wisdom"</code>, <code>"charisma"</code></span>.
      <pre><code class="language-json">"savingThrow": ["constitution", "wisdom"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>abilityCheck</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Ability checks required by this spell (e.g. <code>["str", "dex"]</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>spellAttack</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Spell attack types. <code>"R"</code> for ranged, <code>"M"</code> for melee, <code>"O"</code> for other.
      <pre><code class="language-json">"spellAttack": ["R"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>areaTags</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Area of effect shape tags: <span class="schema-enum" data-enum="spellAreaTags"><code>"ST"</code> Single Target · <code>"MT"</code> Multiple Targets · <code>"R"</code> Circle · <code>"N"</code> Cone · <code>"C"</code> Cube · <code>"Y"</code> Cylinder · <code>"H"</code> Hemisphere · <code>"E"</code> Emanation · <code>"L"</code> Line · <code>"S"</code> Sphere · <code>"Q"</code> Square · <code>"W"</code> Wall</span>. By convention, tag only the effect at the spell's base level.
      <pre><code class="language-json">"areaTags": ["S"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>miscTags</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Miscellaneous automation tags, from the closed set in <strong>Misc tag codes</strong> below. Any other value is a validation error, and the list must contain no duplicates.
      <pre><code class="language-json">"miscTags": ["SMN", "UA"]</code></pre>
    </div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>affectsCreatureType</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">Creature types specifically affected by this spell (e.g. <code>["undead", "fiend"]</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>scalingLevelDice</code>
      <span class="prop-type">array</span>
    </div>
    <div class="prop-card-val">
      Cantrip or level-scaling dice. Each element has:
      <ul>
        <li><code>label</code> — display label, e.g. <code>"Damage"</code></li>
        <li><code>scaling</code> — object mapping character level to dice expression</li>
      </ul>
      <pre><code class="language-json">"scalingLevelDice": [{
  "label": "Damage",
  "scaling": {
    "1": "1d6",
    "5": "2d6",
    "11": "3d6",
    "17": "4d6"
  }
}]</code></pre>
    </div>
  </div>
</div>

### Misc tag codes

The complete `miscTags` set. These drive filtering and VTT automation, so use the
code — the long-form names some older brews use (e.g. `"SummonsCreature"`) are not
valid values and will fail validation.

<span class="schema-enum" data-enum="spellMiscTags"><code>"AAD"</code> Additional Attack Damage · <code>"ADV"</code> Grants Advantage · <code>"ALT"</code> Targets Allies · <code>"BO"</code> Burns Objects · <code>"DFT"</code> Difficult Terrain · <code>"FMV"</code> Forced Movement · <code>"HL"</code> Healing · <code>"LGT"</code> Creates Light · <code>"LGTS"</code> Creates Sunlight · <code>"MAC"</code> Modifies AC · <code>"OBJ"</code> Affects Objects · <code>"OBS"</code> Obscures Vision · <code>"PIR"</code> Permanent If Repeated · <code>"PRM"</code> Permanent Effects · <code>"PS"</code> Plane Shifting · <code>"RO"</code> Rollable Effects · <code>"SCL"</code> Scaling Effects · <code>"SCT"</code> Scaling Targets · <code>"SMN"</code> Summons Creature · <code>"SGT"</code> Requires Sight · <code>"THP"</code> Grants Temporary Hit Points · <code>"TP"</code> Teleportation · <code>"UA"</code> Uses Action · <code>"UBA"</code> Uses Bonus Action · <code>"WLT"</code> Targets Willing Creatures</span>

`BO` (Burns Objects) and `UA` (Uses Action) are recent additions — `UA` marks a
spell whose casting time is an action, the counterpart to the long-standing `UBA`.

### Fluff

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluff</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if this spell has a matching fluff entry in an external fluff file.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>hasFluffImages</code>
      <span class="prop-type">boolean</span>
    </div>
    <div class="prop-card-val">Set to <code>true</code> if the matching fluff entry has images.</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>fluff</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">Inline fluff block with <code>entries</code> and/or <code>images</code>. Use instead of an external fluff file when the spell is defined in the same homebrew JSON.</div>
  </div>
</div>

### Foundry VTT

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryImg</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Spell icon path for Foundry VTT.</div>
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
    <div class="prop-card-val">Module flags in Foundry VTT.</div>
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
    <div class="prop-card-val">Foundry VTT dnd5e v4+ activities (replaces <code>foundrySystem.activities</code>).</div>
  </div>
  <div class="prop-card">
    <div class="prop-card-key">
      <code>foundryAdvice</code>
      <span class="prop-type">string</span>
    </div>
    <div class="prop-card-val">Free-text notes shown to the importer about Foundry VTT setup for this spell.</div>
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

## Examples

### Example 1: Cantrip with Scaling Damage

A lightning cantrip that scales at 5th, 11th, and 17th character level using `scalingLevelDice`.

```json
{
  "name": "Spark Bolt",
  "source": "MyHomebrew",
  "page": 1,
  "level": 0,
  "school": "V",
  "time": [{ "number": 1, "unit": "action" }],
  "range": {
    "type": "point",
    "distance": { "type": "feet", "amount": 120 }
  },
  "components": { "v": true, "s": true },
  "duration": [{ "type": "instant" }],
  "entries": [
    "You hurl a bolt of crackling lightning at one creature or object within range. Make a ranged spell attack. On a hit, the target takes {@damage 1d6} lightning damage.",
    "The spell creates more than one bolt when you reach higher levels: two bolts at 5th level, three bolts at 11th level, and four bolts at 17th level."
  ],
  "spellAttack": ["R"],
  "damageInflict": ["lightning"],
  "scalingLevelDice": [
    {
      "label": "Damage",
      "scaling": {
        "1": "1d6",
        "5": "2d6",
        "11": "3d6",
        "17": "4d6"
      }
    }
  ],
  "classes": {
    "fromClassList": [
      { "name": "Sorcerer", "source": "PHB" },
      { "name": "Wizard", "source": "PHB" }
    ]
  }
}
```

### Example 2: Ritual Concentration Spell with Consumed Component

A 2nd-level abjuration ritual that requires concentration and consumes its material component.

```json
{
  "name": "Gilded Ward",
  "source": "MyHomebrew",
  "page": 2,
  "level": 2,
  "school": "A",
  "meta": { "ritual": true },
  "time": [{ "number": 1, "unit": "minute" }],
  "range": {
    "type": "point",
    "distance": { "type": "self" }
  },
  "components": {
    "v": true,
    "s": true,
    "m": {
      "text": "gold dust worth 25 gp",
      "cost": 2500,
      "consume": true
    }
  },
  "duration": [
    {
      "type": "timed",
      "duration": { "type": "hour", "amount": 1, "upTo": true },
      "concentration": true
    }
  ],
  "entries": [
    "You sprinkle gold dust in a ring around yourself, creating a shimmering aura. For the duration, you gain a +2 bonus to AC and saving throws."
  ],
  "entriesHigherLevel": [
    {
      "type": "entries",
      "name": "At Higher Levels",
      "entries": [
        "When you cast this spell using a slot of 3rd level or higher, the AC bonus increases by 1 for each slot level above 2nd."
      ]
    }
  ],
  "classes": {
    "fromClassList": [{ "name": "Paladin", "source": "PHB" }]
  }
}
```

### Example 3: Summoning Spell with Foundry VTT Overrides

A 4th-level conjuration spell with full tag set and Foundry VTT system overrides for automation. A summon profile's `uuid` is written as `@creature[Name|Source]` — not a Foundry compendium UUID, which fails validation.

```json
{
  "name": "Conjure Clockwork Bird",
  "source": "MyHomebrew",
  "page": 3,
  "level": 4,
  "school": "C",
  "time": [{ "number": 1, "unit": "action" }],
  "range": {
    "type": "point",
    "distance": { "type": "feet", "amount": 30 }
  },
  "components": {
    "v": true,
    "s": true,
    "m": "a broken gear"
  },
  "duration": [
    {
      "type": "timed",
      "duration": { "type": "hour", "amount": 1, "upTo": true },
      "concentration": true
    }
  ],
  "entries": [
    "You conjure a mechanical bird construct in an unoccupied space you can see within range. It uses the {@creature Clockwork Bird|MyHomebrew} stat block and acts on your initiative."
  ],
  "miscTags": ["SMN", "UA"],
  "areaTags": ["ST"],
  "classes": {
    "fromClassList": [
      { "name": "Artificer", "source": "TCE" },
      { "name": "Wizard", "source": "PHB" }
    ]
  },
  "foundryImg": "icons/creatures/mechanical/construct-bird.webp",
  "foundrySystem": {
    "properties": ["vocal", "somatic", "material", "concentration"]
  },
  "foundryActivities": [
    {
      "type": "summon",
      "profiles": [
        { "count": 1, "uuid": "@creature[Clockwork Bird|MyHomebrew]" }
      ]
    }
  ],
  "foundryAdvice": "Import the Clockwork Bird creature before casting; the summon profile resolves it by name and source."
}
```

---

## Validation & Common Mistakes

### Edition cross-check on class sources

Every class reference a spell makes is checked against the **edition declared for the file** in `_meta.edition` (`"classic"` for 2014 rules, `"one"` for 2024 rules; absent behaves as `"classic"`). The check covers all three class-list keys:

- `classes.fromClassList[].source`
- `classes.fromClassListVariant[].source`
- `classes.fromSubclass[].class.source`

If a referenced source is a known 5etools source whose edition differs from the file's edition, validation fails with a **per-entry** error naming the spell and the offending class reference:

```text
<file> spell "Chill Touch" (MyBrew) from edition "classic" had fromSubclass "Wizard" (XPHB) from edition "one"!
```

So a file declaring `"edition": "classic"` may not point a `fromSubclass` (or `fromClassList` / `fromClassListVariant`) entry at a 2024/`"one"` source such as `XPHB`, and a `"one"` file may not point at a classic source such as `PHB`. Unknown sources (including your own homebrew source identifiers) are skipped by the check.

```json
{
  "_meta": { "edition": "classic" },
  "spell": [
    {
      "name": "My Spell",
      "source": "MyBrew",
      "classes": {
        "fromClassList": [{ "name": "Wizard", "source": "PHB" }]
      }
    }
  ]
}
```

(Trimmed to the keys that matter here — a real file also needs the rest of `_meta` (see [meta.md](meta.md)), and a real spell needs `level`, `school`, `time`, `range`, `components`, `duration`, and `entries`.)

Swapping `"PHB"` for `"XPHB"` above, without also changing `_meta.edition` to `"one"`, is the exact failure this check catches.

> A related, file-wide check applies only to `"classic"` files: if a classic-edition file uses *any* modern source anywhere — in `source`, `_copy.source`, `otherSources`, `referenceSources`, `_meta.dependencies`, `_meta.includes`, or inside `{@tag name|source}` text — it is reported as a single error for the file. The class-source check above is separate and runs regardless of the file's edition.

---

## Copy / Inheritance

<div class="prop-cards">
  <div class="prop-card">
    <div class="prop-card-key">
      <code>_copy</code>
      <span class="prop-type">object</span>
    </div>
    <div class="prop-card-val">
      Inherit all properties from another spell and optionally override fields via <code>_mod</code>.
      <pre><code class="language-json">"_copy": { "name": "Fireball", "source": "PHB" }</code></pre>
      See the <a href="Spec_Copy.md">Copy spec</a> for the full <code>_copy</code> key list — the identity keys that pin down what you are copying (<code>className</code>, <code>classSource</code>, <code>shortName</code>, <code>subclassShortName</code>, <code>subclassSource</code>, <code>level</code>, <code>raceName</code>, <code>raceSource</code>, <code>pantheon</code>), plus <code>_templates</code> and <code>_preserve</code>.
    </div>
  </div>
</div>

---

## Schema References

- **Spell schema:** `5etools-utils/schema/brew/spells/spells.json`
- **Entry types:** See [classfeature-conversion.md](classfeature-conversion.md)
