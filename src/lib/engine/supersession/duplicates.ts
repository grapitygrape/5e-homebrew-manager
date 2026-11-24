/**
 * engine/supersession/duplicates.ts - homebrew that shares a name with
 * official content, so the site shows two copies of the same thing.
 *
 * The marker scan only finds a brew that SAYS it replaces something. A brew
 * without a "Replaces:" marker that reuses an official name ("Shield" from
 * Spells That Don't Suck) is just as much a duplicate on the site, and this
 * lists those. Pure; the server hands it the content index's entities.
 *
 * Same rules as override matching: exact names ignoring case, same prop only.
 * Only official content counts as an original. Two brews sharing a name have
 * no obvious winner; that is what a source override is for.
 */
import type { SupersessionRow } from './types.ts';
import { rowKey } from './document.ts';
import { packUid } from './hash.ts';
import { propToPage } from './prop-page.ts';

/** An entity as the content index holds it. */
export interface DuplicateEntity {
  prop: string;
  source: string;
  hash: string;
  name: string;
}

/** One homebrew entity and the official entities it shares a name with. */
export interface Duplicate {
  replacement: DuplicateEntity;
  originals: DuplicateEntity[];
}

/**
 * Every homebrew entity whose name matches official content of the same prop.
 * Unsupersedable props are skipped: there is no page to redirect on.
 */
export function findDuplicates(
  official: DuplicateEntity[],
  homebrew: DuplicateEntity[],
): Duplicate[] {
  const byName = new Map<string, DuplicateEntity[]>();
  for (const e of official) {
    if (!propToPage(e.prop)) continue;
    const key = `${e.prop}|${e.name.toLowerCase()}`;
    const list = byName.get(key);
    if (list) list.push(e);
    else byName.set(key, [e]);
  }

  const out: Duplicate[] = [];
  for (const e of homebrew) {
    const originals = byName.get(`${e.prop}|${e.name.toLowerCase()}`);
    if (originals) out.push({ replacement: e, originals: [...originals] });
  }
  return out.sort(
    (a, b) =>
      a.replacement.name.localeCompare(b.replacement.name) ||
      a.replacement.source.localeCompare(b.replacement.source),
  );
}

/**
 * Drop originals the mapping already handles, by hand or by an override rule,
 * and duplicates left with none. An original mapped to a DIFFERENT brew is
 * still handled: someone chose that, and listing it again would invite a
 * split nobody wants.
 */
export function unmappedDuplicates(
  duplicates: Duplicate[],
  mappedKeys: Set<string>,
): Duplicate[] {
  const out: Duplicate[] = [];
  for (const d of duplicates) {
    const originals = d.originals.filter((o) => {
      const page = propToPage(o.prop);
      return page && !mappedKeys.has(rowKey({ page, hash: o.hash }));
    });
    if (originals.length) out.push({ ...d, originals });
  }
  return out;
}

/** Identity of a duplicate, for keyed rendering and dismissal. */
export const duplicateId = (d: Duplicate): string =>
  `${d.replacement.prop}|${packUid(d.replacement.name, d.replacement.source)}`;

/** The rows that map each original to this duplicate's homebrew copy. */
export function duplicateRows(d: Duplicate): SupersessionRow[] {
  const { replacement } = d;
  const target = {
    page: propToPage(replacement.prop) ?? '',
    prop: replacement.prop,
    uid: packUid(replacement.name, replacement.source),
  };
  return d.originals.map((o) => ({
    displayName: o.name,
    source: o.source,
    page: propToPage(o.prop) ?? '',
    hash: o.hash,
    prop: o.prop,
    replacedBy: [{ ...target }],
  }));
}
