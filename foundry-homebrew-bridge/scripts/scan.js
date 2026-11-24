/**
 * scan.js — find superseded content in this world's actors and items.
 *
 * INTENT
 *   The manager sends the replacement rules; we report every document that
 *   matches one. The matching itself is lib/replacements.js (pure, tested from
 *   Vitest). This file only walks the world.
 *
 * WHAT IS WALKED
 *   Actors by type (character, npc), each actor's embedded items, and the
 *   world's own Items. Container contents need no special pass: dnd5e stores
 *   them as ordinary items pointing at their container, so they are already in
 *   the flat list. Compendiums are not scanned; nothing there is "in play".
 *   A spell a Cast activity keeps on the sheet is skipped: it follows its
 *   activity, which `references` reports.
 *
 * REFERENCES
 *   With `references`, also what an actor points at without holding it: a
 *   subclass granting a superseded spell at a level not reached yet, a feature
 *   casting one, a description linking one.
 */

import { normalizeName } from './lib/match.js';
import { documentReferences, indexRules, matchDocument } from './lib/replacements.js';

/**
 * A uuid outside any actor that could name an Item. An old `@Compendium` link
 * has no document type in it, so any compendium uuid qualifies.
 */
const isOutsideItem = (uuid) =>
  /(^Compendium\.|(^|\.)Item\.)/.test(uuid) && !/(^|\.)Actor\./.test(uuid);

/**
 * Whether a referenced document could be an original, judged by its name from
 * what Foundry already holds (a world item, a loaded document, or the
 * compendium's index) so most of a sheet's links cost no round trip. Only the
 * name: dnd5e fills an index entry's source book from its pack, which the
 * document itself leaves empty, and matching has always read the document.
 * @param {ReturnType<typeof indexRules>} byName
 */
export function mightBeOriginal(uuid, byName) {
  let found = null;
  try {
    found = fromUuidSync(uuid);
  } catch {
    // Something embedded in an unloaded compendium entry; load it to see.
  }
  return !found?.name || byName.has(normalizeName(found.name));
}

/** The rule a referenced document is the original of, with its name. */
async function judgeUuid(uuid, byName) {
  if (!mightBeOriginal(uuid, byName)) return null;
  let doc;
  try {
    doc = await fromUuid(uuid);
  } catch {
    return null;
  }
  if (doc?.documentName !== 'Item') return null;
  const found = matchDocument(doc.toObject(), byName);
  return found?.state === 'original' ? { ruleId: found.ruleId, name: doc.name } : null;
}

/**
 * Every place an actor or its items point at a superseded document.
 * @param {Actor} actor
 * @param {ReturnType<typeof indexRules>} byName
 * @param {Map<string, Promise<{ ruleId: string, name: string }|null>>} [cache]
 *   uuid → judgement, shared across actors so each document loads once
 * @param {string[]} [kinds] only these kinds of reference (`link`, `grant`…)
 * @returns {Promise<Array<{ ruleId: string, uuid: string, name: string, kind: string, level?: number, holderUuid: string, holderName: string }>>}
 */
export async function findReferences(actor, byName, cache = new Map(), kinds = null) {
  const refs = [];
  for (const holder of [actor, ...actor.items]) {
    for (const ref of documentReferences(holder.toObject())) {
      if (kinds && !kinds.includes(ref.kind)) continue;
      if (!isOutsideItem(ref.uuid)) continue;
      if (!cache.has(ref.uuid)) cache.set(ref.uuid, judgeUuid(ref.uuid, byName));
      const found = await cache.get(ref.uuid);
      if (!found) continue;
      refs.push({
        ...ref,
        ...found,
        holderUuid: holder.uuid,
        holderName: holder.name,
      });
    }
  }
  return refs;
}

/**
 * @param {{ rules: Array<object>, scope: { characters?: boolean, npcs?: boolean, items?: boolean }, references?: boolean }} command
 * @returns {Promise<{ hits: object[], refs: object[], scanned: { actors: number, items: number } }>}
 */
export async function runScan(command) {
  const byName = indexRules(command.rules ?? []);
  const scope = command.scope ?? {};
  const hits = [];
  const refs = [];
  const cache = new Map();
  let actors = 0;
  let items = 0;

  const judge = (item, location) => {
    const raw = item.toObject?.() ?? item;
    if (raw.flags?.dnd5e?.cachedFor) return;
    items++;
    const found = matchDocument(raw, byName);
    if (!found) return;
    hits.push({
      uuid: item.uuid,
      name: item.name,
      docType: item.type ?? '',
      ...found,
      location,
    });
  };

  for (const actor of game.actors) {
    const wanted =
      (actor.type === 'character' && scope.characters) ||
      (actor.type === 'npc' && scope.npcs);
    if (!wanted) continue;
    actors++;
    const location = {
      kind: 'actor',
      actorUuid: actor.uuid,
      actorName: actor.name,
      actorType: actor.type,
    };
    for (const item of actor.items) judge(item, location);
    if (command.references) {
      for (const ref of await findReferences(actor, byName, cache))
        refs.push({ ...ref, location });
    }
  }

  if (scope.items) {
    for (const item of game.items) judge(item, { kind: 'world' });
  }

  return { hits, refs, scanned: { actors, items } };
}
