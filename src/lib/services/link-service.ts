/**
 * lib/services/link-service.ts — build (and cache) the content-link index.
 *
 * INTENT
 *   One LinkIndex over everything link targets can resolve to: every official
 *   array we know how to load (OFFICIAL_SOURCES) plus EVERY array in EVERY
 *   homebrew file (homebrew coverage is total, which is what lets the checker
 *   treat a missing name under a homebrew source as a hard error). Building it
 *   reads the whole homebrew folder + official data once, so it's memoized like
 *   the other services and dropped by resetDataSource().
 */
import { cachedResource, getDataSource } from './datasource';
import { OFFICIAL_SOURCES } from '$lib/data';
import {
  createLinkIndex,
  indexEntity,
  indexHomebrewMeta,
  indexSourceEditions,
  indexSpecificVariants,
} from '$lib/engine/audit';
import { getSchemasCached } from './schema-service';
import type { LinkIndex } from '$lib/engine/audit';
import type { Entity } from '$lib/engine/types';

async function buildIndex(): Promise<LinkIndex> {
  const ds = getDataSource();
  const index = createLinkIndex();

  // Classic/modern source lists drive the 2014/2024 mismatch checks.
  const schemas = await getSchemasCached().catch(() => ({}));
  const srcKey = Object.keys(schemas).find((k) =>
    k.endsWith('sources-5etools.json'),
  );
  if (srcKey)
    indexSourceEditions(index, (schemas as Record<string, unknown>)[srcKey]);

  // Kept for generating "+1 Longsword"-style items once everything is read.
  const baseItems: Entity[] = [];
  const variants: Entity[] = [];
  const collect = (prop: string, entities: Entity[]): void => {
    if (prop === 'baseitem') baseItems.push(...entities);
    else if (prop === 'magicvariant') variants.push(...entities);
  };

  // Official data — every prop we have a loader for gets FULL coverage.
  await Promise.all(
    Object.keys(OFFICIAL_SOURCES).map(async (prop) => {
      const entities = await ds.getOfficial(prop).catch(() => [] as Entity[]);
      if (!entities.length) return;
      index.officialProps.add(prop);
      collect(prop, entities);
      for (const e of entities) indexEntity(index, prop, e);
    }),
  );

  // Homebrew — consume the DataSource's cached corpus so ALL array props are
  // indexed (monster, deity, table, … — not just the props the merge pipeline serves).
  const corpus = await ds.getHomebrewCorpus().catch(() => null);
  for (const { doc } of corpus?.files ?? []) {
    if (!doc) continue;
    indexHomebrewMeta(index, doc._meta);
    for (const [key, val] of Object.entries(doc)) {
      if (key.startsWith('_') || key === '$schema' || !Array.isArray(val))
        continue;
      collect(key, val as Entity[]);
      for (const entity of val as Entity[]) {
        if (entity && typeof entity === 'object')
          indexEntity(index, key, entity);
      }
    }
  }

  indexSpecificVariants(index, baseItems, variants);
  return index;
}

const linkIndexCache = cachedResource(buildIndex);

/** Called on a config change, alongside the other cache resets. */
export const resetLinkIndex = (): void => linkIndexCache.reset();

export const getLinkIndex = (force = false): Promise<LinkIndex> =>
  linkIndexCache.get(force);
