/**
 * engine/blocklist/unblock.ts — allowing one thing back out of a wildcard block.
 *
 * THE PROBLEM
 *   5etools' blocklist has block rules and nothing else. There is no "allow"
 *   rule, no negation, no precedence beyond "any matching rule hides it". So
 *   "all of PHB except Fireball" is not directly expressible.
 *
 *   The only representation is to expand the wildcard into its siblings: drop
 *   `*|*|PHB`, then block every OTHER type of PHB wholesale and every OTHER
 *   PHB spell individually. Fireball is then the one thing no rule names.
 *
 * THE COST IS REAL AND IS THE POINT
 *   That expansion is as large as the sibling set. In this corpus the median
 *   type holds 5 entries, so the usual carve-out is three or four rules — but a
 *   fully-blocked ConfC gives up 2,439 rules to spare one creature. Callers get
 *   `added` back and are expected to say so out loud; nothing here refuses on
 *   size, because the alternative to a big expansion is not a small one, it is
 *   not being able to express the exception at all.
 *
 * PEELING, NOT REBUILDING
 *   Layers come off one at a time — source wildcard first, then type wildcard —
 *   so an item under a fully-blocked source costs both. Rules for other sources
 *   are never touched.
 */
import { entryKey } from './entries.ts';
import type { BlocklistEntry } from './entries.ts';

/** The node the user just ticked. `hash: '*'` means a whole content type. */
export interface UnblockTarget {
  hash: string;
  /** A real prop — the source row itself is an exact rule, not a covered one. */
  category: string;
  source: string;
}

export interface UnblockContext {
  /** Every blockable prop present in this source, from its summary. */
  types: string[];
  /** Every entity in source+category. Only consulted for item targets. */
  siblings: { hash: string; name: string }[];
}

export interface UnblockResult {
  entries: BlocklistEntry[];
  /** Explicit rules the expansion added. */
  added: number;
  /** Wildcard rules it removed. */
  removed: number;
  /**
   * True when a covering rule is auto-managed, so nothing was changed. 5etools
   * owns those rules; silently rewriting them into 40 of our own would be a
   * worse outcome than declining.
   */
  refusedAuto: boolean;
}

const lower = (s: string) => s.toLowerCase();

export function unblockNode(
  entries: BlocklistEntry[],
  target: UnblockTarget,
  ctx: UnblockContext,
): UnblockResult {
  const src = lower(target.source);
  const cat = lower(target.category);

  const find = (hash: string, category: string) =>
    entries.find(
      (e) =>
        lower(e.source) === src &&
        lower(e.category) === category &&
        lower(e.hash) === hash,
    );

  const sourceWide = find('*', '*');
  const typeWide = find('*', cat);
  const exact = target.hash === '*' ? undefined : find(lower(target.hash), cat);

  if ((sourceWide ?? typeWide ?? exact) === undefined) {
    return { entries, added: 0, removed: 0, refusedAuto: false };
  }
  // An auto-managed rule anywhere in the chain stops the whole operation.
  if ([sourceWide, typeWide, exact].some((e) => e?.isAuto)) {
    return { entries, added: 0, removed: 0, refusedAuto: true };
  }

  const doomed = new Set<string>();
  for (const e of [sourceWide, typeWide, exact]) if (e) doomed.add(entryKey(e));
  const kept = entries.filter((e) => !doomed.has(entryKey(e)));

  // Whatever survived still counts — a sibling rule already on the list must not
  // be added twice, and must not be counted as new.
  const present = new Set(kept.map(entryKey));
  const out = [...kept];
  let added = 0;
  const add = (e: BlocklistEntry) => {
    const key = entryKey(e);
    if (present.has(key)) return;
    present.add(key);
    out.push(e);
    added++;
  };

  // Layer 1: the source wildcard becomes every OTHER type, blocked wholesale.
  if (sourceWide) {
    for (const prop of ctx.types) {
      if (lower(prop) === cat) continue;
      add({
        displayName: '*',
        hash: '*',
        category: prop,
        source: target.source,
        isAuto: false,
      });
    }
  }

  // Layer 2: the type wildcard becomes every OTHER entry, blocked individually.
  // Skipped for a whole-type target — removing the wildcard is the whole job.
  if (target.hash !== '*') {
    const needle = lower(target.hash);
    for (const sib of ctx.siblings) {
      if (lower(sib.hash) === needle) continue;
      add({
        displayName: sib.name,
        hash: sib.hash,
        category: target.category,
        source: target.source,
        isAuto: false,
      });
    }
  }

  return { entries: out, added, removed: doomed.size, refusedAuto: false };
}
