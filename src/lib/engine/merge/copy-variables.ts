/**
 * engine/merge/copy-variables.ts — `<$mode__detail$>` variables in `_mod`
 * payloads (`<$name$>`, `<$to_hit__str$>`, `<$damage_avg__1d6+str$>`, …),
 * resolved against the merged entity the way 5etools' copyApplier does.
 */
import type { Obj } from '../../util.ts';
import type { CopyTrace } from './copy-applier.ts';
import {
  ABILS,
  abilityMod,
  asArray,
  cleanMath,
  crToPb,
  fmtBonus,
  walkStrings,
} from './copy-math.ts';

function shortName(ent: Obj, titleCase: boolean): string {
  const name = String(ent.name ?? '');
  const named = !!ent.isNamedCreature;
  const prefix = named ? '' : titleCase ? 'The ' : 'the ';
  if (ent.shortName === true) return `${prefix}${name}`;
  if (typeof ent.shortName === 'string')
    return `${prefix}${!prefix && titleCase ? ent.shortName : ent.shortName.toLowerCase()}`;
  let out = name
    .split(',')[0]
    .replace(/(?:adult|ancient|young) \w+ (dragon|dracolich)/gi, '$1');
  out = named ? out.split(' ')[0] : out.toLowerCase();
  return `${prefix}${out}`;
}

const SIZE_MULT: Record<string, number> = { L: 2, H: 3, G: 4 };
const sizeMult = (ent: Obj): number =>
  SIZE_MULT[(asArray(ent.size)[0] as string) ?? 'M'] ?? 1;

/** Resolve one `<$mode__detail$>` variable; null ⇒ leave the text as-is. */
function resolveVariable(
  mode: string,
  detail: string | undefined,
  ent: Obj,
): string | number | null {
  const abil = (): number => abilityMod(ent[detail ?? '']);
  switch (mode) {
    case 'name':
      return String(ent.name ?? '');
    case 'short_name':
      return shortName(ent, false);
    case 'title_short_name':
      return shortName(ent, true);
    case 'dc':
    case 'spell_dc':
      if (!detail || !ABILS.includes(detail)) return null;
      return 8 + abil() + crToPb(ent.cr);
    case 'to_hit':
      if (!detail || !ABILS.includes(detail)) return null;
      return fmtBonus(crToPb(ent.cr) + abil());
    case 'damage_mod': {
      if (!detail || !ABILS.includes(detail)) return null;
      const t = abil();
      return t === 0 ? '' : t > 0 ? ` + ${t}` : ` - ${Math.abs(t)}`;
    }
    case 'damage_avg': {
      const expr = (detail ?? '')
        .replace(/\b(str|dex|con|int|wis|cha)\b/gi, (m) =>
          String(abilityMod(ent[m.toLowerCase()])),
        )
        .replace(/\bsize_mult\b/g, () => String(sizeMult(ent)));
      const v = cleanMath(expr);
      return v == null ? null : Math.floor(v);
    }
    case 'size_mult': {
      const mult = sizeMult(ent);
      if (!detail) return mult;
      const v = cleanMath(`${mult} * (${detail})`);
      return v == null ? null : Math.floor(v);
    }
    default:
      return null;
  }
}

const VAR_RE = /<\$([^$]+)\$>/g;

export function resolveVariables(
  obj: unknown,
  ent: Obj,
  trace?: CopyTrace,
): unknown {
  return walkStrings(obj, (s) =>
    s.replace(VAR_RE, (m0, inner: string) => {
      const [mode, detail] = inner.split('__');
      const v = resolveVariable(mode, detail, ent);
      if (v == null) {
        trace?.warnings.push(`unresolved variable ${m0}`);
        return m0;
      }
      trace?.steps.push({
        kind: 'variable',
        prop: '',
        detail: `${m0} → ${JSON.stringify(v)}`,
        ok: true,
      });
      return String(v);
    }),
  );
}
