/**
 * engine/render/format.ts — small, pure 5etools value formatters.
 *
 * INTENT
 *   The string/number/list helpers translate.ts leans on: currency, ability
 *   blocks, proficiency lists, resist/immune lists, senses, prerequisites, ASIs.
 *   Each is total (never throws) and returns "" / "None" for empty input so the
 *   renderer can decide whether to show a row.
 *
 * REUSE NOTES
 *   - Ported from translate.js. Kept independent of tags.ts/entries.ts so these
 *     can be unit-tested and reused (e.g. a future CSV/Markdown exporter).
 */

export function capitalize(str: unknown): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const ABILITY_NAMES: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export function formatAbilityObj(
  ability: Record<string, unknown> | null | undefined,
): string {
  if (!ability) return '';
  return Object.entries(ability)
    .map(([k, v]) => `${ABILITY_NAMES[k] || k.toUpperCase()} ${v}`)
    .join(', ');
}

/** Currency in copper → human gp/sp/cp ("Free" for 0, "—" for absent). */
export function formatValue(valueCp: number | null | undefined): string {
  if (valueCp === undefined || valueCp === null) return '—';
  if (valueCp === 0) return 'Free';
  if (valueCp >= 100) return `${valueCp / 100} gp`;
  if (valueCp >= 10) return `${valueCp / 10} sp`;
  return `${valueCp} cp`;
}

type ProfItem = string | Record<string, unknown>;

export function formatProfList(list: ProfItem[] | null | undefined): string {
  if (!Array.isArray(list) || list.length === 0) return '';
  const result: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      result.push(capitalize(item.split('|')[0]));
      continue;
    }
    if (item && typeof item === 'object') {
      for (const [k, v] of Object.entries(item)) {
        if (k === 'choose' && v && typeof v === 'object') {
          const choose = v as { from?: unknown[]; count?: number };
          const from = Array.isArray(choose.from)
            ? choose.from
                .map((x) =>
                  capitalize(
                    typeof x === 'string' ? x.split('|')[0] : JSON.stringify(x),
                  ),
                )
                .join(', ')
            : 'any';
          result.push(`Choose ${choose.count || 1} from: ${from}`);
        } else if (v === true) {
          result.push(capitalize(k.split('|')[0]));
        } else if (typeof v === 'number') {
          result.push(`${capitalize(k.split('|')[0])} (${v})`);
        } else {
          result.push(`${capitalize(k.split('|')[0])}: ${v}`);
        }
      }
    }
  }
  return result.join(', ');
}

/** Damage resist/immune/vulnerable/conditionImmune lists. */
export function formatResistList(list: ProfItem[] | null | undefined): string {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list
    .map((item) => {
      if (typeof item === 'string') return capitalize(item);
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const parts: string[] = [];
        if (typeof obj.special === 'string') parts.push(obj.special);
        if (Array.isArray(obj.resist))
          parts.push(obj.resist.map((r) => capitalize(String(r))).join(', '));
        if (typeof obj.preNote === 'string') parts.unshift(obj.preNote);
        if (typeof obj.note === 'string') parts.push(`(${obj.note})`);
        return parts.join(' ');
      }
      return JSON.stringify(item);
    })
    .join(', ');
}

export function formatSenses(senses: unknown): string {
  if (!senses) return '';
  if (Array.isArray(senses)) {
    return senses
      .map((s) => {
        if (typeof s === 'string') return s;
        if (s && typeof s === 'object')
          return Object.entries(s)
            .map(([k, v]) => `${capitalize(k)} ${v}`)
            .join(', ');
        return JSON.stringify(s);
      })
      .join(', ');
  }
  if (typeof senses === 'object') {
    return Object.entries(senses as Record<string, unknown>)
      .map(([k, v]) => `${capitalize(k)} ${v}`)
      .join(', ');
  }
  return String(senses);
}

/** Feat/optional-feature prerequisites → readable text ("None" when empty). */
export function translatePrerequisites(prereqs: unknown): string {
  if (!Array.isArray(prereqs) || prereqs.length === 0) return 'None';

  return prereqs
    .map((p: Record<string, unknown>) => {
      const list: string[] = [];
      if (p.level !== undefined) {
        if (typeof p.level === 'object' && p.level) {
          const lvl = p.level as { level?: number; class?: { name?: string } };
          list.push(`Level ${lvl.level} in ${lvl.class?.name || 'class'}`);
        } else {
          list.push(`Level ${p.level}`);
        }
      }
      if (Array.isArray(p.ability))
        p.ability.forEach((ab) =>
          list.push(formatAbilityObj(ab as Record<string, unknown>)),
        );
      if (Array.isArray(p.race)) {
        list.push(
          `Race: ${p.race.map((r: Record<string, unknown>) => r.displayEntry || r.name).join(' or ')}`,
        );
      }
      if (p.spellcasting) list.push('Ability to cast at least one spell');
      if (Array.isArray(p.feat))
        list.push(
          `Feat: ${p.feat.map((f: string) => f.split('|')[0]).join(' or ')}`,
        );
      if (p.pact) list.push(`Pact of the ${p.pact}`);
      if (Array.isArray(p.feature))
        list.push(`Feature: ${p.feature.join(' or ')}`);
      else if (p.feature) list.push(`Feature: ${p.feature}`);
      if (Array.isArray(p.spell)) {
        const names = p.spell
          .map((s) => {
            if (typeof s === 'string')
              return capitalize(s.split('#')[0].split('|')[0]);
            if (s && typeof s === 'object') {
              const so = s as Record<string, unknown>;
              return String(so.entrySummary || so.entry || JSON.stringify(s));
            }
            return String(s);
          })
          .join(' or ');
        list.push(`Spell: ${names}`);
      }
      if (Array.isArray(p.item)) list.push(`Item: ${p.item.join(' or ')}`);
      else if (p.item) list.push(`Item: ${p.item}`);
      if (Array.isArray(p.proficiency)) {
        const profs = p.proficiency
          .map((pr: Record<string, unknown>) =>
            Object.entries(pr)
              .map(([k, v]) => `${capitalize(String(v))} ${capitalize(k)}`)
              .join(', '),
          )
          .join(' and ');
        list.push(`Proficiency in: ${profs}`);
      }
      if (p.other) list.push(String(p.other));
      return list.join(' and ');
    })
    .join(' OR ');
}

/** Ability score increases → readable text ("None" when empty). */
export function translateAbilityIncreases(abilityList: unknown): string {
  if (!Array.isArray(abilityList) || abilityList.length === 0) return 'None';
  const list: string[] = [];
  for (const a of abilityList as Record<string, unknown>[]) {
    if (a.choose && typeof a.choose === 'object') {
      const choose = a.choose as { from?: string[]; amount?: number };
      const from = (choose.from || []).map((k) => k.toUpperCase()).join(', ');
      list.push(`+${choose.amount} to one of: ${from}`);
    } else {
      for (const [k, v] of Object.entries(a)) {
        if (k !== 'hidden') list.push(`+${v} to ${k.toUpperCase()}`);
      }
    }
  }
  return list.join(', ');
}
