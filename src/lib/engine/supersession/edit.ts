/**
 * engine/supersession/edit.ts - saving an EDIT, which can remove.
 *
 * `mergeRows` only ever adds: two rows claiming one original become a split,
 * never a replacement. That is right for "Add a replacement" and wrong for
 * "Edit", where trimming a chip has to actually drop the mapping. Editing
 * therefore deletes the group it opened before merging what came back.
 *
 * `removeGroup` is the same question asked by the Delete button, and it has
 * the same trap: what a group means depends on which way the table is grouped.
 */
import type { SupersessionRow } from './types.ts';
import { mergeRows, removeTarget, rowKey } from './document.ts';
import type { MergeRowsResult } from './document.ts';

/** Drop every row in `keys`, then merge `incoming`. `rows` is not mutated. */
export function replaceGroup(
  rows: SupersessionRow[],
  keys: Iterable<string>,
  incoming: SupersessionRow[],
): MergeRowsResult {
  const drop = new Set(keys);
  return mergeRows(
    rows.filter((row) => !drop.has(rowKey(row))),
    incoming,
  );
}

/**
 * Delete a whole group. Which of two deletions that is depends on the view
 * the group came from, and getting it wrong destroys mappings nobody selected:
 *
 *   - No `uid` (the default view): the group IS each original's entire target
 *     set, so the rows go.
 *   - With a `uid` (the swapped view): the group is ONE replacement, and a row
 *     with several targets appears under each of them. Only that target may be
 *     dropped; `removeTarget` still removes a row whose last target goes, which
 *     is right - a mapping with nothing to point at is not a mapping.
 */
export function removeGroup(
  rows: SupersessionRow[],
  keys: Iterable<string>,
  uid?: string,
): SupersessionRow[] {
  if (uid === undefined) {
    const drop = new Set(keys);
    return rows.filter((row) => !drop.has(rowKey(row)));
  }
  let out = rows;
  for (const key of keys) out = removeTarget(out, key, uid);
  return out;
}
