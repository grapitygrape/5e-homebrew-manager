/**
 * engine/supersession/scan.ts - the whole corpus's markers, as rows to add.
 *
 * Pure so it can be tested without a filesystem: the server hands it the marker
 * records it already caches and a lookup into the content index.
 *
 * The `marker === ''` skip is load bearing. The marker index holds EVERY
 * homebrew entity, and one without a marker parses to `reason: 'no "Replaces:"
 * marker'`. Treating those as review notes would bury the page under thousands
 * of them; only an entity that actually claims to replace something is scanned.
 */
import type { ReviewItem, SupersessionRow } from './types.ts';
import type { MarkerParse } from './parse-marker.ts';
import { buildRowsFromMarker, propForTag } from './build-row.ts';
import { packUid } from './hash.ts';

export interface MarkerLike {
  prop: string;
  source: string;
  name: string;
  hash: string;
  parse: MarkerParse;
}

export interface ScanResult {
  candidates: SupersessionRow[];
  review: ReviewItem[];
  /** Entities that carried a marker, whichever way they resolved. */
  scanned: number;
}

/**
 * Every marker in the corpus, split into rows we can build and notes we can't.
 * `isKnown` answers whether a marker's target exists here - a marker naming a
 * book this install lacks would otherwise write a mapping that matches nothing.
 */
export function scanMarkers(
  records: MarkerLike[],
  isKnown: (prop: string, name: string, source: string) => boolean,
): ScanResult {
  const candidates: SupersessionRow[] = [];
  const review: ReviewItem[] = [];
  let scanned = 0;

  for (const record of records) {
    const { parse } = record;
    if (!parse.marker) continue;
    scanned++;

    const uid = packUid(record.name, record.source);
    if (parse.reason) {
      review.push({
        replacement: uid,
        reason: parse.reason,
        targets: parse.targets.map((t) => packUid(t.name, t.source || '?')),
      });
      continue;
    }

    const unknown = parse.targets.filter(
      (t) => !isKnown(propForTag(t.tag, record.prop), t.name, t.source),
    );
    if (unknown.length) {
      review.push({
        replacement: uid,
        reason: `names content not in the corpus: ${unknown
          .map((t) => packUid(t.name, t.source))
          .join(', ')}`,
        targets: parse.targets.map((t) => packUid(t.name, t.source || '?')),
      });
      continue;
    }

    candidates.push(
      ...buildRowsFromMarker(
        { name: record.name, source: record.source, prop: record.prop },
        parse.targets,
      ),
    );
  }

  return { candidates, review, scanned };
}
