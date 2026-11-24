/**
 * engine/merge/copy-math.ts — helpers shared by the copy applier: object
 * paths, string walking, `{@tag}` splitting, and the statblock math
 * (proficiency bonus, ability modifiers, CR → XP) that 5etools keeps in
 * `Parser`.
 */
import { safeArithmetic } from './arithmetic.ts';
import { isObj, type Obj } from '../../util.ts';

// --- small utilities ------------------------------------------------------------------

export const clone = <T>(v: T): T =>
  v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
export const asArray = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v === undefined ? [] : [v];

export function getPath(obj: unknown, path: string[]): unknown {
  let cur = obj;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Obj)[seg];
  }
  return cur;
}

export function setPath(obj: Obj, path: string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (!isObj(cur[path[i]]) && !Array.isArray(cur[path[i]])) cur[path[i]] = {};
    cur = cur[path[i]] as Obj;
  }
  cur[path[path.length - 1]] = value;
}

export function deletePath(obj: Obj, path: string[]): void {
  const parent = getPath(obj, path.slice(0, -1));
  if (parent && typeof parent === 'object')
    delete (parent as Obj)[path[path.length - 1]];
}

/** Deep walk replacing strings. */
export function walkStrings(v: unknown, fn: (s: string) => string): unknown {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => walkStrings(x, fn));
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) out[k] = walkStrings(x, fn);
    return out;
  }
  return v;
}

export const deepEquals = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Split a string into plain-text and `{@tag …}` chunks (nesting-aware). */
export function splitByTags(str: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '{' && str[i + 1] === '@') {
      if (depth === 0 && buf) {
        out.push(buf);
        buf = '';
      }
      depth++;
    } else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        out.push(buf + c);
        buf = '';
        continue;
      }
    }
    buf += c;
  }
  if (buf) out.push(buf);
  return out;
}

// --- statblock math (Parser equivalents) ----------------------------------------------

export const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const SIZE_ABVS = ['T', 'S', 'M', 'L', 'H', 'G', 'C', 'V'];
export const SKILL_TO_ABIL: Record<string, string> = {
  athletics: 'str',
  acrobatics: 'dex',
  'sleight of hand': 'dex',
  stealth: 'dex',
  arcana: 'int',
  history: 'int',
  investigation: 'int',
  nature: 'int',
  religion: 'int',
  'animal handling': 'wis',
  insight: 'wis',
  medicine: 'wis',
  perception: 'wis',
  survival: 'wis',
  deception: 'cha',
  intimidation: 'cha',
  performance: 'cha',
  persuasion: 'cha',
};
export const CR_XP: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

export const crString = (cr: unknown): string | null =>
  typeof cr === 'string'
    ? cr
    : isObj(cr) && typeof cr.cr === 'string'
      ? cr.cr
      : null;

function crToNumber(cr: unknown): number | null {
  const s = crString(cr);
  if (!s) return null;
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return b ? a / b : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function crToPb(cr: unknown): number {
  const n = crToNumber(cr);
  if (n == null) return 0;
  if (n < 5) return 2;
  return Math.ceil(n / 4) + 1;
}

export const abilityMod = (score: unknown): number =>
  Math.floor((Number(score) - 10) / 2);

export const fmtBonus = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

/** Strip to math characters, then evaluate safely (never eval). */
export const cleanMath = (s: string): number | null =>
  safeArithmetic(s.replace(/[^-+/*0-9.()]+/g, ''));
