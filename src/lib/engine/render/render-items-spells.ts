/**
 * engine/render/render-items-spells.ts — spell and item sheets.
 */
import { renderEntry } from './entries.ts';
import { capitalize, formatResistList, formatValue } from './format.ts';
import { row, type Renderer } from './sheet.ts';
import {
  DMG_TYPES,
  ITEM_TYPES,
  SCHOOLS,
  SPELL_LEVELS,
  WEAPON_PROPS,
} from './tables.ts';

export const renderSpell: Renderer = (entity, { source, page }) => {
  const level = Number(entity.level);
  const levelStr = SPELL_LEVELS[level] || `${level}th-level`;
  const school = SCHOOLS[entity.school as string] || 'Universal';
  const time = (
    entity.time as
      { number?: number; unit?: string; condition?: string }[] | undefined
  )?.[0];
  const castingTime = `${time?.number} ${time?.unit}${time?.condition ? ` (${time.condition})` : ''}`;

  let range = 'Self';
  const r = entity.range as
    | {
        type?: string;
        distance?: { amount?: number; type?: string; queue?: string };
      }
    | undefined;
  if (r) {
    if (r.type === 'distance')
      range = `${r.distance?.amount} ${r.distance?.queue || r.distance?.type || 'ft.'}`;
    else if (r.type) range = capitalize(r.type);
  }

  let components = 'V, S';
  const c = entity.components as
    { v?: boolean; s?: boolean; m?: boolean | { text?: string } } | undefined;
  if (c) {
    const list: string[] = [];
    if (c.v) list.push('V');
    if (c.s) list.push('S');
    if (c.m)
      list.push(typeof c.m === 'object' ? `M (${c.m.text || 'M'})` : 'M');
    components = list.join(', ');
  }

  let duration = 'Instantaneous';
  const d = (
    entity.duration as
      | {
          type?: string;
          duration?: { amount?: number; unit?: string };
          concentration?: boolean;
        }[]
      | undefined
  )?.[0];
  if (d) {
    if (d.type === 'timed')
      duration = `${d.duration?.amount} ${d.duration?.unit}${d.concentration ? ' (concentration)' : ''}`;
    else if (d.type === 'permanent') duration = 'Permanent';
  }

  const properties: Record<string, unknown> = {
    level,
    school,
    castingTime,
    range,
    components,
    duration,
  };
  const metaRows = [
    row('Casting Time', castingTime),
    row('Range', range),
    row('Components', components),
    row('Duration', duration),
  ];

  const classes = entity.classes as
    | {
        fromClassList?: { name: string }[];
        fromSubclassList?: {
          class: { name: string };
          subclass: { name: string };
        }[];
      }
    | undefined;
  if (classes?.fromClassList) {
    const v = classes.fromClassList.map((cl) => cl.name).join(', ');
    properties.classes = v;
    metaRows.push(row('Classes', v));
  }
  if (classes?.fromSubclassList) {
    const v = classes.fromSubclassList
      .map((sc) => `${sc.class.name} (${sc.subclass.name})`)
      .join(', ');
    properties.subclasses = v;
    metaRows.push(row('Subclasses', v));
  }
  if (Array.isArray(entity.damageInflicted)) {
    const v = entity.damageInflicted
      .map((x) => capitalize(String(x)))
      .join(', ');
    properties.damageTypes = v;
    metaRows.push(row('Damage Types', v));
  }
  if (Array.isArray(entity.savingThrow)) {
    const v = entity.savingThrow.map((x) => capitalize(String(x))).join(', ');
    properties.savingThrows = v;
    metaRows.push(row('Saving Throws', v));
  }

  const higher = entity.entriesHigherLevel
    ? `<div class="higher-levels"><strong>At Higher Levels:</strong> ${renderEntry(entity.entriesHigherLevel as never)}</div>`
    : '';
  return {
    badgeText: `${levelStr} ${school}`,
    badgeClass: 'badge-spell',
    extraClass: 'spell-sheet',
    metaRows,
    body: `${renderEntry(entity.entries)}${higher}`,
    properties,
    textSummary: `${levelStr} ${school}. Casting Time: ${castingTime}. Range: ${range}. Components: ${components}. Duration: ${duration}.`,
  };
};

export const renderItem: Renderer = (entity, { source, page }) => {
  const primaryType = String(entity.type || 'OTH').split('|')[0];
  const itemType = ITEM_TYPES[primaryType] || 'Item';
  const valueStr = formatValue(entity.value as number);
  const weight = entity.weight !== undefined ? `${entity.weight} lb.` : '—';
  const rarity = (entity.rarity as string) || 'none';
  const attuneStr = entity.reqAttune
    ? typeof entity.reqAttune === 'string'
      ? `Yes (${entity.reqAttune})`
      : 'Yes'
    : 'No';

  const properties: Record<string, unknown> = {
    itemType,
    value: valueStr,
    weight,
    rarity,
    attunement: attuneStr,
  };
  const metaRows = [
    row('Cost', valueStr),
    row('Weight', weight),
    row('Attunement', attuneStr),
  ];

  if (primaryType === 'M' || primaryType === 'R') {
    if (entity.weaponCategory) {
      const v = capitalize(entity.weaponCategory as string);
      properties.weaponCategory = v;
      metaRows.push(row('Category', v));
    }
    if (entity.dmg1) {
      let dmgStr = String(entity.dmg1);
      if (entity.dmgType) {
        const dt = DMG_TYPES[entity.dmgType as string] || entity.dmgType;
        properties.dmgType = dt;
        dmgStr += ` ${dt}`;
      }
      properties.dmg1 = entity.dmg1;
      metaRows.push(row('Damage', dmgStr));
    }
    if (entity.dmg2) {
      properties.dmg2 = entity.dmg2;
      metaRows.push(row('Versatile/Alt Damage', entity.dmg2));
    }
    if (entity.range) {
      properties.range = entity.range;
      metaRows.push(row('Range', entity.range));
    }
    if (Array.isArray(entity.property)) {
      const v = entity.property
        .map(
          (p) =>
            WEAPON_PROPS[
              typeof p === 'string' ? p : (p as { property: string }).property
            ] ||
            (typeof p === 'string' ? p : (p as { property: string }).property),
        )
        .join(', ');
      properties.properties = v;
      metaRows.push(row('Properties', v));
    }
  }
  if (entity.ac) {
    properties.ac = entity.ac;
    metaRows.push(row('AC', entity.ac));
  }
  if (entity.strength) {
    properties.strength = entity.strength;
    metaRows.push(row('Strength Required', entity.strength));
  }
  if (entity.stealth) {
    properties.stealth = true;
    metaRows.push(row('Stealth', 'Disadvantage'));
  }

  const add = (label: string, key: string, value: string) => {
    if (value) {
      properties[key] = value;
      metaRows.push(row(label, value));
    }
  };
  add('Resistances', 'resist', formatResistList(entity.resist as never));
  add('Immunities', 'immune', formatResistList(entity.immune as never));
  add(
    'Vulnerabilities',
    'vulnerable',
    formatResistList(entity.vulnerable as never),
  );
  add(
    'Condition Immunities',
    'conditionImmune',
    formatResistList(entity.conditionImmune as never),
  );

  if (entity.charges) {
    properties.charges = entity.charges;
    metaRows.push(
      row(
        'Charges',
        `Charges: ${entity.charges}${entity.recharge ? ` (Recharges ${entity.recharge})` : ''}`,
      ),
    );
  }
  if (Array.isArray(entity.attachedSpells)) {
    const v = entity.attachedSpells
      .map((s) => capitalize(String(s).split('|')[0]))
      .join(', ');
    properties.attachedSpells = v;
    metaRows.push(row('Spells', v));
  }
  return {
    badgeText: `${String(rarity).toUpperCase()} ${itemType}`,
    badgeClass: `badge-item rarity-${String(rarity).replace(' ', '-')}`,
    extraClass: 'item-sheet',
    metaRows,
    body: renderEntry(entity.entries),
    properties,
    textSummary: `${String(rarity).toUpperCase()} ${itemType}. Value: ${valueStr}. Weight: ${weight}. Attunement: ${attuneStr}.`,
  };
};
