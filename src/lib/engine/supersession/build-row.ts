/**
 * engine/supersession/build-row.ts - turn a pick (or a marker) into a row.
 *
 * Two ways a mapping gets made, one row shape out of both:
 *   - a "Replaces:" marker on the replacement names its originals
 *   - the user pairs an original and a replacement by hand
 */
import type { EntityRef, SupersessionRow } from './types.ts';
import type { MarkerTarget } from './parse-marker.ts';
import { hashForEntity, packUid } from './hash.ts';
import { propToPage } from './prop-page.ts';

/**
 * 5etools tag to the prop it addresses, for the tags a "Replaces:" marker
 * plausibly uses. An unlisted tag falls back to the replacement's own prop,
 * which is right for the same-type replacements markers actually describe.
 */
export const TAG_TO_PROP: Record<string, string> = {
  spell: 'spell',
  item: 'item',
  baseitem: 'baseitem',
  itemMastery: 'itemMastery',
  creature: 'monster',
  race: 'race',
  subrace: 'subrace',
  feat: 'feat',
  background: 'background',
  condition: 'condition',
  disease: 'disease',
  status: 'status',
  action: 'action',
  object: 'object',
  trap: 'trap',
  hazard: 'hazard',
  deity: 'deity',
  reward: 'reward',
  psionic: 'psionic',
  optfeature: 'optionalfeature',
  variantrule: 'variantrule',
  table: 'table',
  vehicle: 'vehicle',
  vehupgrade: 'vehicleUpgrade',
  language: 'language',
  boon: 'boon',
  cult: 'cult',
  class: 'class',
  subclass: 'subclass',
  classFeature: 'classFeature',
  subclassFeature: 'subclassFeature',
  card: 'card',
  deck: 'deck',
  recipe: 'recipe',
  charoption: 'charoption',
  facility: 'facility',
  book: 'book',
  adventure: 'adventure',
};

/** The prop a marker tag addresses, falling back to the replacement's own. */
export const propForTag = (tag: string, fallback: string): string =>
  TAG_TO_PROP[tag] ?? fallback;

/** Thrown when a pick can't become a row; the message is shown to the user. */
export class SupersessionBuildError extends Error {}

function pageFor(ent: EntityRef): string {
  const page = propToPage(ent.prop);
  if (!page) {
    throw new SupersessionBuildError(
      `"${ent.prop}" has no 5etools list page, so it cannot be superseded.`,
    );
  }
  return page;
}

/** One original-to-replacement row, ready to merge into the document. */
export function buildManualRow(
  original: EntityRef,
  replacement: EntityRef,
): SupersessionRow {
  if (!original.name || !original.source) {
    throw new SupersessionBuildError('The original needs a name and a source.');
  }
  if (!replacement.name || !replacement.source) {
    throw new SupersessionBuildError(
      'The replacement needs a name and a source.',
    );
  }
  const page = pageFor(original);
  const replacementPage = pageFor(replacement);
  return {
    displayName: original.name,
    source: original.source,
    page,
    hash: hashForEntity(original),
    prop: original.prop,
    replacedBy: [
      {
        page: replacementPage,
        prop: replacement.prop,
        uid: packUid(replacement.name, replacement.source),
      },
    ],
  };
}

/**
 * A row per original the marker named. "A and B" is legitimate - one
 * replacement, two originals, one row each - which is the opposite of a split
 * (one original, several replacements) and is why this returns a list.
 */
export function buildRowsFromMarker(
  replacement: EntityRef,
  targets: MarkerTarget[],
): SupersessionRow[] {
  return targets.map((target) =>
    buildManualRow(
      {
        name: target.name,
        source: target.source,
        prop: propForTag(target.tag, replacement.prop),
      },
      replacement,
    ),
  );
}

/**
 * One row per original, each carrying every replacement as a target.
 *
 * The picker stages two lists and Save pairs them: N originals x M
 * replacements is N rows of M targets, the first primary. Duplicate
 * replacements collapse - staging the same entity twice is a slip, not a
 * request for a duplicate target.
 */
export function buildManualRows(
  originals: EntityRef[],
  replacements: EntityRef[],
): SupersessionRow[] {
  if (!originals.length) {
    throw new SupersessionBuildError('Pick at least one item to replace.');
  }
  if (!replacements.length) {
    throw new SupersessionBuildError('Pick at least one new item.');
  }
  return originals.map((original) => {
    const [first, ...rest] = replacements;
    const row = buildManualRow(original, first);
    const seen = new Set(row.replacedBy.map((t) => t.uid));
    for (const replacement of rest) {
      const uid = packUid(replacement.name, replacement.source);
      if (seen.has(uid)) continue;
      seen.add(uid);
      row.replacedBy.push({
        page: pageFor(replacement),
        prop: replacement.prop,
        uid,
      });
    }
    return row;
  });
}
