/**
 * engine/merge/copy-mods.ts — every `_mod` mode 5etools' copyApplier knows:
 * the generic array/string/prop modes and the bestiary-specific ones
 * (senses, saves, skills, spells, size, XP, to-hit and DC scaling).
 *
 * A mode throws ModError for anything 5etools would throw on; applyCopy turns
 * that into a trace error instead of failing the whole entity.
 */
import { isObj, type Obj } from '../../util.ts';
import {
  ABILS,
  CR_XP,
  SIZE_ABVS,
  SKILL_TO_ABIL,
  abilityMod,
  asArray,
  cleanMath,
  clone,
  crString,
  crToPb,
  deepEquals,
  fmtBonus,
  getPath,
  setPath,
  splitByTags,
  walkStrings,
} from './copy-math.ts';

export class ModError extends Error {}

interface ModCtx {
  copyTo: Obj;
  modInfo: Obj;
  path: string[] | null;
}

function replaceStringHandler(
  re: RegExp,
  withStr: string,
  tagInsensitive: boolean,
): (s: string) => string {
  return (str) => {
    if (tagInsensitive) return str.replace(re, withStr);
    return splitByTags(str)
      .map((chunk) =>
        chunk.startsWith('{@') ? chunk : chunk.replace(re, withStr),
      )
      .join('');
  };
}

const modRegex = (m: Obj): RegExp =>
  new RegExp(String(m.replace), `g${(m.flags as string) || ''}`);

function requirePath(ctx: ModCtx): string[] {
  if (!ctx.path)
    throw new ModError(`mode "${ctx.modInfo.mode}" needs a property key`);
  return ctx.path;
}

function replaceArr(ctx: ModCtx, isThrow: boolean): boolean {
  const path = requirePath(ctx);
  const items = asArray(ctx.modInfo.items);
  const existing = getPath(ctx.copyTo, path);
  if (!Array.isArray(existing)) {
    if (isThrow) throw new ModError(`could not find "${path.join('.')}" array`);
    return false;
  }
  const rep = ctx.modInfo.replace as unknown;
  let ix: number;
  if (isObj(rep) && typeof rep.regex === 'string') {
    const re = new RegExp(rep.regex, (rep.flags as string) || '');
    ix = existing.findIndex((it) =>
      isObj(it) && it.name
        ? re.test(String(it.name))
        : typeof it === 'string'
          ? re.test(it)
          : false,
    );
  } else if (isObj(rep) && typeof rep.index === 'number') {
    ix = rep.index;
  } else {
    ix = existing.findIndex((it) =>
      isObj(it) && it.name ? it.name === rep : it === rep,
    );
  }
  if (ix >= 0 && ix < existing.length) {
    existing.splice(ix, 1, ...clone(items));
    return true;
  }
  if (isThrow)
    throw new ModError(
      `could not find "${path.join('.')}" item ${JSON.stringify(rep)} to replace`,
    );
  return false;
}

function appendArr(ctx: ModCtx): void {
  const path = requirePath(ctx);
  const items = clone(asArray(ctx.modInfo.items));
  const existing = getPath(ctx.copyTo, path);
  setPath(
    ctx.copyTo,
    path,
    Array.isArray(existing) ? existing.concat(items) : items,
  );
}

function spellcastingTrait(copyTo: Obj, name?: unknown): Obj {
  const sc = copyTo.spellcasting;
  if (!Array.isArray(sc) || !sc.length)
    throw new ModError('creature has no spellcasting property');
  const trait = name
    ? (sc.find((s) => isObj(s) && s.name === name) as Obj | undefined)
    : (sc[0] as Obj);
  if (!trait)
    throw new ModError(`no spellcasting trait named "${String(name)}"`);
  return trait;
}

const FREQ_PROPS = [
  'recharge',
  'legendary',
  'charges',
  'rest',
  'restLong',
  'daily',
  'weekly',
  'monthly',
  'yearly',
];

export const MODES: Record<string, (ctx: ModCtx) => void> = {
  appendStr({ copyTo, modInfo, path }) {
    const p = requirePath({ copyTo, modInfo, path });
    const cur = getPath(copyTo, p);
    setPath(
      copyTo,
      p,
      cur
        ? `${cur}${(modInfo.joiner as string) || ''}${modInfo.str}`
        : modInfo.str,
    );
  },
  replaceName(ctx) {
    const ents = getPath(ctx.copyTo, requirePath(ctx));
    if (!Array.isArray(ents)) return;
    const fn = replaceStringHandler(
      modRegex(ctx.modInfo),
      String(ctx.modInfo.with),
      !!ctx.modInfo.tagInsensitive,
    );
    for (const e of ents)
      if (isObj(e) && typeof e.name === 'string') e.name = fn(e.name);
  },
  replaceTxt(ctx) {
    const path = requirePath(ctx);
    const ents = getPath(ctx.copyTo, path);
    if (!ents) return;
    const fn = replaceStringHandler(
      modRegex(ctx.modInfo),
      String(ctx.modInfo.with),
      !!ctx.modInfo.tagInsensitive,
    );
    const props = (ctx.modInfo.props as (string | null)[] | undefined) ?? [
      null,
      'entries',
      'headerEntries',
      'footerEntries',
    ];
    if (!Array.isArray(ents)) {
      // Not an array (e.g. a plain string prop): replace in place.
      setPath(ctx.copyTo, path, walkStrings(ents, fn));
      return;
    }
    if (props.includes(null))
      setPath(
        ctx.copyTo,
        path,
        ents.map((it) => (typeof it === 'string' ? fn(it) : it)),
      );
    const cur = getPath(ctx.copyTo, path) as unknown[];
    for (const e of cur) {
      if (!isObj(e)) continue;
      for (const p of props)
        if (p != null && e[p]) e[p] = walkStrings(e[p], fn);
    }
  },
  prependArr(ctx) {
    const path = requirePath(ctx);
    const items = clone(asArray(ctx.modInfo.items));
    const existing = getPath(ctx.copyTo, path);
    setPath(
      ctx.copyTo,
      path,
      Array.isArray(existing) ? items.concat(existing) : items,
    );
  },
  appendArr,
  appendIfNotExistsArr(ctx) {
    const path = requirePath(ctx);
    const items = clone(asArray(ctx.modInfo.items));
    const existing = getPath(ctx.copyTo, path);
    if (!Array.isArray(existing)) return setPath(ctx.copyTo, path, items);
    setPath(
      ctx.copyTo,
      path,
      existing.concat(
        items.filter((it) => !existing.some((x) => deepEquals(it, x))),
      ),
    );
  },
  replaceArr(ctx) {
    replaceArr(ctx, true);
  },
  replaceOrAppendArr(ctx) {
    if (!replaceArr(ctx, false)) appendArr(ctx);
  },
  insertArr(ctx) {
    const path = requirePath(ctx);
    const existing = getPath(ctx.copyTo, path);
    if (!Array.isArray(existing))
      throw new ModError(`could not find "${path.join('.')}" array`);
    const index = Number(ctx.modInfo.index);
    existing.splice(
      index >= 0 ? index : existing.length,
      0,
      ...clone(asArray(ctx.modInfo.items)),
    );
  },
  removeArr(ctx) {
    const path = requirePath(ctx);
    const existing = getPath(ctx.copyTo, path);
    if (!Array.isArray(existing))
      throw new ModError(`could not find "${path.join('.')}" array`);
    if (ctx.modInfo.names !== undefined) {
      for (const n of asArray(ctx.modInfo.names)) {
        const ix = existing.findIndex((it) => isObj(it) && it.name === n);
        if (ix >= 0) existing.splice(ix, 1);
        else if (!ctx.modInfo.force)
          throw new ModError(
            `could not find "${path.join('.')}" item named "${String(n)}" to remove`,
          );
      }
    } else if (ctx.modInfo.items !== undefined) {
      for (const item of asArray(ctx.modInfo.items)) {
        const ix = existing.findIndex((it) => it === item);
        if (ix >= 0) existing.splice(ix, 1);
        else
          throw new ModError(
            `could not find "${path.join('.')}" item ${JSON.stringify(item)} to remove`,
          );
      }
    } else throw new ModError('one of "names" or "items" must be provided');
  },
  renameArr(ctx) {
    const path = requirePath(ctx);
    const existing = getPath(ctx.copyTo, path);
    if (!Array.isArray(existing))
      throw new ModError(`could not find "${path.join('.')}" array`);
    for (const r of asArray(ctx.modInfo.renames) as Obj[]) {
      const e = existing.find((it) => isObj(it) && it.name === r.rename) as
        Obj | undefined;
      if (!e)
        throw new ModError(
          `could not find "${path.join('.')}" item named "${String(r.rename)}" to rename`,
        );
      e.name = r.with;
    }
  },
  calculateProp(ctx) {
    const path = requirePath(ctx);
    let tgt = getPath(ctx.copyTo, path);
    if (!isObj(tgt)) {
      tgt = {};
      setPath(ctx.copyTo, path, tgt);
    }
    const formula = String(ctx.modInfo.formula).replace(
      /<\$([^$]+)\$>/g,
      (_m, v: string) => {
        if (v === 'prof_bonus') return String(crToPb(ctx.copyTo.cr));
        if (v === 'dex_mod') return String(abilityMod(ctx.copyTo.dex));
        throw new ModError(`unknown variable "${v}"`);
      },
    );
    const val = cleanMath(formula);
    if (val == null)
      throw new ModError(
        `could not evaluate formula "${String(ctx.modInfo.formula)}"`,
      );
    (tgt as Obj)[String(ctx.modInfo.prop)] = val;
  },
  scalarAddProp: (ctx) =>
    scalarProp(ctx, (n) => n + Number(ctx.modInfo.scalar)),
  scalarMultProp: (ctx) =>
    scalarProp(ctx, (n) => {
      const out = n * Number(ctx.modInfo.scalar);
      return ctx.modInfo.floor ? Math.floor(out) : out;
    }),
  setProp({ copyTo, modInfo, path }) {
    const combined = modInfo.prop ? String(modInfo.prop).split('.') : [];
    if (path && !(path.length === 1 && path[0] === '*'))
      combined.unshift(...path);
    if (!combined.length) throw new ModError('setProp needs a "prop"');
    setPath(copyTo, combined, clone(modInfo.value));
  },
  prefixSuffixStringProp({ copyTo, modInfo, path }) {
    const combined = modInfo.prop ? String(modInfo.prop).split('.') : [];
    if (path && !(path.length === 1 && path[0] === '*'))
      combined.unshift(...path);
    const s = getPath(copyTo, combined);
    if (typeof s !== 'string') return;
    setPath(
      copyTo,
      combined,
      `${(modInfo.prefix as string) || ''}${s}${(modInfo.suffix as string) || ''}`,
    );
  },
  // -- bestiary-specific ------------------------------------------------------------------
  addSenses({ copyTo, modInfo }) {
    const senses = (
      Array.isArray(copyTo.senses) ? copyTo.senses : (copyTo.senses = [])
    ) as string[];
    for (const sense of asArray(modInfo.senses) as Obj[]) {
      const re = new RegExp(`${String(sense.type)} (\\d+)`, 'i');
      const ix = senses.findIndex((s) => re.test(s));
      if (ix >= 0) {
        const cur = Number(re.exec(senses[ix])![1]);
        if (cur < Number(sense.range))
          senses[ix] = `${sense.type} ${sense.range} ft.`;
      } else senses.push(`${sense.type} ${sense.range} ft.`);
    }
  },
  addSaves({ copyTo, modInfo }) {
    addProfs(copyTo, 'save', modInfo.saves as Obj, (k) => k);
  },
  addSkills({ copyTo, modInfo }) {
    addProfs(copyTo, 'skill', modInfo.skills as Obj, (k) => SKILL_TO_ABIL[k]);
  },
  addAllSaves({ copyTo, modInfo }) {
    addProfs(
      copyTo,
      'save',
      Object.fromEntries(ABILS.map((a) => [a, modInfo.saves])),
      (k) => k,
    );
  },
  addAllSkills({ copyTo, modInfo }) {
    addProfs(
      copyTo,
      'skill',
      Object.fromEntries(
        Object.keys(SKILL_TO_ABIL).map((s) => [s, modInfo.skills]),
      ),
      (k) => SKILL_TO_ABIL[k],
    );
  },
  addSpells({ copyTo, modInfo }) {
    const trait = spellcastingTrait(copyTo, modInfo.name);
    if (isObj(modInfo.spells)) {
      const spells = (trait.spells ??= {}) as Obj;
      for (const [lvl, nu] of Object.entries(modInfo.spells)) {
        if (!spells[lvl]) {
          spells[lvl] = clone(nu);
          continue;
        }
        const old = spells[lvl] as Obj;
        for (const [kk, v] of Object.entries(nu as Obj)) {
          if (!old[kk]) old[kk] = clone(v);
          else if (Array.isArray(old[kk]))
            old[kk] = (old[kk] as string[])
              .concat(v as string[])
              .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
          else if (typeof old[kk] === 'object')
            throw new ModError(`spells object at key ${kk} is not an array`);
          else old[kk] = v;
        }
      }
    }
    for (const p of ['constant', 'will', 'ritual']) {
      if (!modInfo[p]) continue;
      trait[p] = ((trait[p] as unknown[]) ?? []).concat(
        clone(asArray(modInfo[p])),
      );
    }
    for (const p of FREQ_PROPS) {
      if (!isObj(modInfo[p])) continue;
      const freq = (trait[p] ??= {}) as Obj;
      for (const [k, spells] of Object.entries(modInfo[p] as Obj))
        freq[k] = ((freq[k] as unknown[]) ?? []).concat(clone(asArray(spells)));
    }
  },
  replaceSpells({ copyTo, modInfo }) {
    const trait = spellcastingTrait(copyTo);
    const handle = (list: unknown, meta: Obj): void => {
      if (!Array.isArray(list))
        throw new ModError(
          `could not find spell list for "${String(meta.replace)}"`,
        );
      const ix = list.indexOf(meta.replace);
      if (ix < 0)
        throw new ModError(
          `could not find spell "${String(meta.replace)}" to replace`,
        );
      list.splice(ix, 1, ...asArray(meta.with));
      list.sort((a: string, b: string) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      );
    };
    if (isObj(modInfo.spells)) {
      const spells = (trait.spells ?? {}) as Obj;
      for (const [lvl, metas] of Object.entries(modInfo.spells)) {
        if (!spells[lvl]) continue;
        for (const m of asArray(metas) as Obj[])
          handle((spells[lvl] as Obj).spells, m);
      }
    }
    if (isObj(modInfo.daily)) {
      for (const [k, metas] of Object.entries(modInfo.daily))
        for (const m of asArray(metas) as Obj[])
          handle((trait.daily as Obj | undefined)?.[k], m);
    }
  },
  removeSpells({ copyTo, modInfo }) {
    const trait = spellcastingTrait(copyTo);
    if (isObj(modInfo.spells) && isObj(trait.spells)) {
      for (const [lvl, rm] of Object.entries(modInfo.spells)) {
        const slot = (trait.spells as Obj)[lvl] as Obj | undefined;
        if (!Array.isArray(slot?.spells)) continue;
        slot.spells = (slot.spells as unknown[]).filter(
          (s) => !asArray(rm).includes(s),
        );
      }
    }
    // NB: 5etools computes but discards the constant/will/ritual filter (a site
    // bug) — we match it, so those lists are left unchanged.
    for (const p of FREQ_PROPS) {
      if (!isObj(modInfo[p]) || !isObj(trait[p])) continue;
      for (const [k, rm] of Object.entries(modInfo[p] as Obj)) {
        const cur = (trait[p] as Obj)[k];
        if (Array.isArray(cur))
          (trait[p] as Obj)[k] = cur.filter((s) => !asArray(rm).includes(s));
      }
    }
  },
  maxSize({ copyTo, modInfo }) {
    const cur = asArray(copyTo.size).map((s) => SIZE_ABVS.indexOf(String(s)));
    const max = SIZE_ABVS.indexOf(String(modInfo.max));
    if (max < 0 || cur.some((ix) => ix < 0))
      throw new ModError('unhandled size');
    const nxt = cur.filter((ix) => ix <= max).sort((a, b) => a - b);
    if (!nxt.length) nxt.push(max);
    copyTo.size = nxt.map((ix) => SIZE_ABVS[ix]);
  },
  scalarMultXp({ copyTo, modInfo }) {
    const mult = (n: number): number => {
      const out = n * Number(modInfo.scalar);
      return modInfo.floor ? Math.floor(out) : out;
    };
    if (isObj(copyTo.cr) && copyTo.cr.xp != null) {
      copyTo.cr.xp = mult(Number(copyTo.cr.xp));
      return;
    }
    const crStr = crString(copyTo.cr);
    const xp = crStr ? CR_XP[crStr] : undefined;
    if (xp == null) throw new ModError('creature has no usable CR');
    if (!isObj(copyTo.cr)) copyTo.cr = { cr: crStr };
    (copyTo.cr as Obj).xp = mult(xp);
  },
  scalarAddHit: (ctx) =>
    scalarTag(ctx, /\{@hit ([-+]?\d+)\}/g, (n) => `{@hit ${n}}`),
  scalarAddDc: (ctx) =>
    scalarTag(ctx, /\{@dc (\d+)(?:\|[^}]+)?\}/g, (n) => `{@dc ${n}}`),
};

function scalarProp(ctx: ModCtx, fn: (n: number) => number): void {
  const tgt = getPath(ctx.copyTo, requirePath(ctx));
  if (!isObj(tgt)) return;
  const apply = (k: string): void => {
    const out = fn(Number(tgt[k]));
    tgt[k] = typeof tgt[k] === 'string' ? fmtBonus(out) : out;
  };
  if (ctx.modInfo.prop === '*') Object.keys(tgt).forEach(apply);
  else apply(String(ctx.modInfo.prop));
}

function scalarTag(ctx: ModCtx, re: RegExp, fmt: (n: number) => string): void {
  const path = requirePath(ctx);
  const cur = getPath(ctx.copyTo, path);
  if (!cur) return;
  const scalar = Number(ctx.modInfo.scalar);
  setPath(
    ctx.copyTo,
    path,
    walkStrings(cur, (s) =>
      s.replace(re, (_m, n: string) => fmt(Number(n) + scalar)),
    ),
  );
}

function addProfs(
  copyTo: Obj,
  prop: 'save' | 'skill',
  modes: Obj,
  abilOf: (k: string) => string | undefined,
): void {
  const tgt = (isObj(copyTo[prop]) ? copyTo[prop] : (copyTo[prop] = {})) as Obj;
  for (const [k, mode] of Object.entries(modes ?? {})) {
    const abil = abilOf(k);
    if (!abil) throw new ModError(`unknown ${prop} "${k}"`);
    const total = Number(mode) * crToPb(copyTo.cr) + abilityMod(copyTo[abil]);
    if (tgt[k] != null && Number(tgt[k]) >= total) continue; // never reduce
    tgt[k] = fmtBonus(total);
  }
}

export const SUPPORTED_MOD_MODES: string[] = Object.keys(MODES);
