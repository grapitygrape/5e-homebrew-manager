/**
 * replace.js — swap an item on a sheet for what replaces it, and keep the
 * world's replacement rules.
 *
 * The data handling (what carries over, which favorites and pins to rewrite)
 * is lib/replacements.js, pure and tested. This file does the Foundry calls.
 *
 * ORDER, AND WHY
 *   Create the new item, point favorites, pins and references at it, then
 *   delete the old one. Deleting last means a failure midway leaves a duplicate
 *   the GM can see, never a character who has lost the spell.
 *
 * REFERENCES
 *   The rest of the sheet is rewritten too: the advancement that granted the
 *   old item (so leveling down removes the new one), grants and choice lists
 *   still offering the original, Cast activities casting it, and @UUID links to
 *   it or to the old item in descriptions and the biography, including the
 *   relative `.Item.id` links Foundry writes within one actor. A Cast activity's
 *   kept spell is swapped by dnd5e itself once the activity's uuid changes.
 */

import CONSTANTS from './constants.js';
import { buildIndex, loadBodies } from './search.js';
import { findReferences } from './scan.js';
import { normalizeName } from './lib/match.js';
import {
  buildReplacementData,
  indexRules,
  mapActivityIds,
  orderCandidates,
  parseRules,
  previousValues,
  readSourceLabels,
  remapActorReferences,
  rewriteReferences,
} from './lib/replacements.js';

/** "Items › Imported › Spells" for a world item; empty at the top level. */
function folderPath(doc) {
  const folder = doc.folder;
  if (!folder) return '';
  return [...(folder.ancestors ?? [])]
    .reverse()
    .concat(folder)
    .map((f) => f.name)
    .join(' › ');
}

/**
 * Every document a rule could point at: world Items and compendiums with the
 * replacement's name. The one matching its source comes first, `suggested`.
 * @returns {Promise<Array<{ raw: object, uuid: string, name: string, source: string, pack: string, packLabel: string, folder: string, origin: string, suggested: boolean }>>}
 */
export async function findCandidates(rule) {
  const index = await buildIndex();
  const entries = index.byNorm.get(normalizeName(rule.replacementName)) ?? [];
  await loadBodies(entries);
  const found = [];
  for (const entry of entries) {
    const doc = entry.doc;
    if (!doc) continue;
    const raw = doc.toObject();
    found.push({
      raw,
      uuid: entry.uuid,
      name: doc.name,
      source: readSourceLabels(raw).book,
      pack: entry.pack,
      packLabel: entry.packLabel,
      folder: entry.pack === 'world' ? folderPath(doc) : '',
      // Where a world item was imported from, when Foundry recorded it.
      origin: doc._stats?.compendiumSource ?? '',
    });
  }
  return orderCandidates(found, rule.replacementSource);
}

/**
 * Load every rule's replacement in one request per pack, ahead of the first
 * swap. The first load from a pack after a reload has taken the server over a
 * second, which an import would otherwise sit waiting on.
 */
export async function warmReplacements() {
  const rules = parseRules(game.settings.get(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.RULES));
  const index = await buildIndex();
  await loadBodies(
    rules.flatMap((r) => index.byNorm.get(normalizeName(r.replacementName)) ?? []),
  );
}

/**
 * The document a rule points at, when it can be told without asking.
 * @returns {Promise<{ raw: object, uuid: string }>}
 */
export async function findReplacement(rule) {
  const found = await findCandidates(rule);
  if (!found.length)
    throw new Error(
      game.i18n.format('HM-BRIDGE.err-no-replacement', {
        name: rule.replacementName,
      }),
    );
  const pick = found.find((c) => c.suggested);
  if (!pick)
    throw new Error(
      game.i18n.format('HM-BRIDGE.err-ambiguous-replacement', {
        name: rule.replacementName,
        source: rule.replacementSource,
      }),
    );
  return pick;
}

/** The replacement the GM chose, else the one the rule points at. */
async function chosenReplacement(command) {
  if (!command.replacementUuid) return findReplacement(command.rule);
  const doc = await fromUuid(String(command.replacementUuid));
  if (!doc)
    throw new Error(
      game.i18n.format('HM-BRIDGE.err-no-doc', {
        uuid: command.replacementUuid,
      }),
    );
  return { raw: doc.toObject(), uuid: doc.uuid };
}

/**
 * Write a field whole rather than merging into it, so a removed key goes:
 * v14's `_replace` operator, v13's `==` key.
 */
function replaceField(path, value) {
  if (typeof globalThis._replace === 'function')
    return { [path]: globalThis._replace(value) };
  const parts = path.split('.');
  const last = parts.pop();
  return { [[...parts, `==${last}`].join('.')]: value };
}

/**
 * What to rewrite on the actor: every document it references that the rule
 * supersedes, and, when an item is being swapped, the old item itself.
 * @param {{ old: Item, created: Item, oldRaw: object }} [swapped]
 * @param {string[]} [kinds] only these kinds of reference; see findReferences
 */
async function referenceSwap(actor, rule, replacement, swapped, kinds) {
  const uuids = new Map();
  const byName = indexRules([{ ...rule, id: 'rule' }]);
  for (const ref of await findReferences(actor, byName, undefined, kinds)) {
    uuids.set(ref.uuid, replacement.uuid);
  }
  const swap = {
    uuids,
    oldName: rule.originalName,
    newName: replacement.raw.name,
  };
  if (swapped) {
    // What the old item was granted from, so the grant's record follows it.
    const { oldRaw, old, created } = swapped;
    for (const src of [oldRaw.flags?.dnd5e?.sourceId, oldRaw._stats?.compendiumSource]) {
      if (src) uuids.set(src, replacement.uuid);
    }
    uuids.set(old.uuid, created.uuid);
    Object.assign(swap, {
      oldName: old.name,
      oldId: old.id,
      newId: created.id,
      newUuid: replacement.uuid,
    });
  }
  return swap;
}

/**
 * Apply a swap to the actor and its items, except `skipId`. Returns the count,
 * and what was overwritten (plain data, so it can sit in a chat flag).
 */
async function rewriteActor(actor, swap, skipId) {
  let count = 0;
  const updates = [];
  const undo = { items: [], actor: null };
  for (const item of actor.items) {
    if (item.id === skipId) continue;
    const raw = item.toObject();
    const r = rewriteReferences(raw, swap, item.uuid);
    if (!r.count) continue;
    count += r.count;
    updates.push({
      _id: item.id,
      ...r.update,
      ...(r.advancement ? replaceField('system.advancement', r.advancement) : {}),
    });
    undo.items.push({
      _id: item.id,
      update: previousValues(raw, r.update),
      advancement: r.advancement ? raw.system.advancement : null,
    });
  }
  if (updates.length)
    await actor.updateEmbeddedDocuments('Item', updates, { hbmBridge: true });

  const raw = actor.toObject();
  const own = rewriteReferences(raw, swap, actor.uuid);
  if (own.count) {
    await actor.update(own.update);
    count += own.count;
    undo.actor = previousValues(raw, own.update);
  }
  return { count, undo };
}

/**
 * After an import swap, point the sheet's links to the original at the
 * replacement. Links only: during a level-up dnd5e is still writing the
 * class's advancement, which must not be overwritten underneath it.
 * @returns {Promise<object|null>} what to restore if the original is allowed
 */
export async function relinkOnImport(actor, rule, replacement) {
  // Grants and Cast activities aren't rewritten here, so don't look them up.
  const swap = await referenceSwap(actor, rule, replacement, undefined, ['link']);
  const { count, undo } = await rewriteActor(actor, { ...swap, linksOnly: true });
  return count ? undo : null;
}

/** Put back what relinkOnImport changed, on items still on the sheet. */
export async function restoreReferences(actor, undo) {
  if (!undo) return;
  const items = (undo.items ?? [])
    .filter((u) => actor.items.has(u._id))
    .map((u) => ({
      _id: u._id,
      ...u.update,
      ...(u.advancement ? replaceField('system.advancement', u.advancement) : {}),
    }));
  if (items.length)
    await actor.updateEmbeddedDocuments('Item', items, { hbmBridge: true });
  if (undo.actor) await actor.update(undo.actor);
}

/**
 * Point an actor's references at the replacement when the original isn't on
 * the sheet: a grant at a level not reached yet, a feature casting it, a link.
 * @param {{ actorUuid: string, rule: object, replacementUuid?: string }} command
 */
export async function runReferenceSwap(command) {
  const actor = await fromUuid(String(command.actorUuid ?? ''));
  if (actor?.documentName !== 'Actor')
    throw new Error(
      game.i18n.format('HM-BRIDGE.err-no-doc', { uuid: command.actorUuid }),
    );
  const replacement = await chosenReplacement(command);
  const swap = await referenceSwap(actor, command.rule, replacement);
  const { count: updated } = await rewriteActor(actor, swap);
  return { name: replacement.raw.name, uuid: replacement.uuid, updated };
}

/**
 * Replace one actor item.
 * @param {{ uuid: string, rule: object, replacementUuid?: string }} command
 *   `replacementUuid` when the GM picked among several candidates
 */
export async function runReplace(command) {
  const old = await fromUuid(String(command.uuid ?? ''));
  const actor = old?.parent;
  if (!old || actor?.documentName !== 'Actor')
    throw new Error(game.i18n.localize('HM-BRIDGE.err-not-on-actor'));

  const replacement = await chosenReplacement(command);
  const oldRaw = old.toObject();
  const data = buildReplacementData(
    oldRaw,
    replacement.raw,
    command.rule,
    replacement.uuid,
  );

  const [created] = await actor.createEmbeddedDocuments('Item', [data], {
    hbmBridge: true,
  });
  const activities = mapActivityIds(oldRaw, created.toObject());
  const { update, changed, dropped } = remapActorReferences(
    actor.toObject(),
    old.id,
    created.id,
    activities,
  );

  // A container's contents point at it by id.
  const contents = actor.items.filter((i) => i.system?.container === old.id);
  if (contents.length) {
    await actor.updateEmbeddedDocuments(
      'Item',
      contents.map((i) => ({ _id: i.id, 'system.container': created.id })),
      { hbmBridge: true },
    );
  }
  if (Object.keys(update).length) await actor.update(update);
  const swap = await referenceSwap(actor, command.rule, replacement, {
    old,
    created,
    oldRaw,
  });
  const { count: updated } = await rewriteActor(actor, swap, old.id);
  await old.delete({ hbmBridge: true });

  return {
    name: created.name,
    uuid: created.uuid,
    references: changed,
    updated,
    dropped,
  };
}

/**
 * Keep the manager's rules in the world, so players' clients can enforce them.
 * The manager sends them on every connect, so an unchanged list isn't written.
 */
export async function storeRules(rules) {
  const list = parseRules(JSON.stringify(rules ?? []));
  const text = JSON.stringify(list);
  const key = CONSTANTS.SETTINGS.RULES;
  if (game.settings.get(CONSTANTS.MODULE_ID, key) !== text)
    await game.settings.set(CONSTANTS.MODULE_ID, key, text);
  return list.length;
}
