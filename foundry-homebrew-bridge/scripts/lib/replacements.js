/**
 * lib/replacements.js — which Foundry documents are superseded content.
 *
 * PURE, like match.js: no Foundry globals, so the manager's Vitest suite
 * imports it directly. scan.js walks the world and hands each document here.
 *
 * A DOCUMENT IS A HIT WHEN
 *   original   its name and source match a rule's original (Daylight, XPHB).
 *   replaced   it already carries the marker a Replace writes into the source
 *              Custom Label ("Replaces Daylight XPHB"), so a renamed stand-in
 *              is still found and listed.
 *
 * SOURCE IS MATCHED LOOSELY
 *   dnd5e keeps a free-text book label ("XPHB", "PHB 2024", "Player's
 *   Handbook"), not an abbreviation. A document with no source at all still
 *   matches on name, since imports that skipped the label are common.
 */

import { normalizeName } from './match.js';

/** The Custom Label a Replace writes. */
export const REPLACES_PREFIX = 'Replaces ';

/**
 * Index rules by the normalized original name.
 * @param {Array<{ id: string, originalName: string, originalSource: string }>} rules
 * @returns {Map<string, typeof rules>}
 */
export function indexRules(rules) {
  const byName = new Map();
  for (const rule of rules) {
    const key = normalizeName(rule.originalName);
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(rule);
    else byName.set(key, [rule]);
  }
  return byName;
}

/**
 * Does a document's source label name this source abbreviation?
 * An empty label is "unknown", which matches anything.
 * @param {string} label
 * @param {string} source
 */
export function sourceMatches(label, source) {
  const have = normalizeName(label);
  const want = normalizeName(source);
  if (!have || !want) return true;
  return have === want || have.split(' ').includes(want);
}

/**
 * Read the source label off a raw document (`toObject()` or plain data).
 * @param {any} raw
 * @returns {{ book: string, custom: string }}
 */
export function readSourceLabels(raw) {
  const src = raw?.system?.source;
  if (typeof src === 'string') return { book: src, custom: '' };
  return {
    book: String(src?.book ?? ''),
    custom: String(src?.custom ?? ''),
  };
}

/**
 * Judge one document against the rules.
 * @param {any} raw
 * @param {Map<string, Array<{ id: string, originalName: string, originalSource: string }>>} byName
 * @returns {{ ruleId: string, state: 'original'|'replaced' } | null}
 */
export function matchDocument(raw, byName) {
  const { book, custom } = readSourceLabels(raw);

  // A stand-in a Replace already made: the label says what it replaced.
  if (custom.startsWith(REPLACES_PREFIX)) {
    const claimed = normalizeName(custom.slice(REPLACES_PREFIX.length));
    for (const [name, bucket] of byName) {
      for (const rule of bucket) {
        const full = normalizeName(
          `${rule.originalName} ${rule.originalSource}`,
        );
        if (claimed === full || claimed === name)
          return { ruleId: rule.id, state: 'replaced' };
      }
    }
  }

  const bucket = byName.get(normalizeName(raw?.name));
  if (!bucket) return null;
  const rule = bucket.find((r) => sourceMatches(book, r.originalSource));
  return rule ? { ruleId: rule.id, state: 'original' } : null;
}

// --- doing the swap ---------------------------------------------------------
// Everything below is data in, data out, so Vitest can cover it without a world.

/** Tidy 5e Sheets' module id, which prefixes its flags. */
export const TIDY_ID = 'tidy5e-sheet';

/** Copy a plain object so edits never reach the document it came from. */
const clone = (value) => JSON.parse(JSON.stringify(value ?? null));

/** The `Name Source` text a Replace writes into the Custom Label. */
export const replacesLabel = (rule) =>
  `${REPLACES_PREFIX}${rule.originalName}${rule.originalSource ? ` ${rule.originalSource}` : ''}`;

/**
 * The data for the item that takes an old item's place on a sheet.
 *
 * Keeps what makes the slot the player's rather than the item's: its place in
 * the list, the container it sits in, how it is equipped or prepared, how many
 * there are, and Tidy's custom sections. Everything else is the replacement's.
 * It also keeps the advancement that granted the old item (a class's spell
 * list, a subclass feature), so leveling down still removes it.
 * @param {any} oldRaw the item being replaced, as `toObject()`
 * @param {any} newRaw the replacement, as `toObject()`
 * @param {{ originalName: string, originalSource: string }} rule
 * @param {string} [replacementUuid] where the replacement came from
 */
export function buildReplacementData(oldRaw, newRaw, rule, replacementUuid) {
  const data = clone(newRaw);
  for (const key of ['_id', 'folder', 'ownership', '_stats', 'pack']) {
    delete data[key];
  }
  data.sort = oldRaw.sort ?? data.sort ?? 0;

  const oldDnd = oldRaw.flags?.dnd5e ?? {};
  const dnd = { ...(data.flags?.dnd5e ?? {}) };
  delete dnd.advancementOrigin;
  delete dnd.advancementRoot;
  for (const key of ['advancementOrigin', 'advancementRoot']) {
    if (oldDnd[key]) dnd[key] = oldDnd[key];
  }
  if (replacementUuid) {
    // dnd5e finds granted items by these when it reverses an advancement.
    dnd.sourceId = replacementUuid;
    if (replacementUuid.startsWith('Compendium.'))
      data._stats = { compendiumSource: replacementUuid };
  }
  if (Object.keys(dnd).length) {
    data.flags ??= {};
    data.flags.dnd5e = dnd;
  }

  data.system ??= {};
  data.system.source = {
    ...(data.system.source ?? {}),
    custom: replacesLabel(rule),
  };

  const oldSystem = oldRaw.system ?? {};
  if (oldSystem.container !== undefined) {
    data.system.container = oldSystem.container;
  }
  // Only fields both items have, so a spell's preparation never lands on a feat.
  for (const key of ['equipped', 'prepared', 'method', 'preparation', 'quantity', 'attuned', 'attunement']) {
    if (key in oldSystem && key in data.system) {
      data.system[key] = clone(oldSystem[key]);
    }
  }

  const oldTidy = oldRaw.flags?.[TIDY_ID] ?? {};
  for (const key of ['section', 'actionSection']) {
    if (oldTidy[key] === undefined) continue;
    data.flags ??= {};
    data.flags[TIDY_ID] = { ...(data.flags[TIDY_ID] ?? {}), [key]: oldTidy[key] };
  }
  return data;
}

/**
 * The data an item about to be created should have instead, when it is swapped
 * before it exists. Keeps the id the caller asked for, since an importer or a
 * level-up grant may look the item up by it afterwards.
 * @returns {any} the data, or null when the replacement is another item type,
 *   which Foundry can't change on a pending document
 */
export function importSwapData(original, newRaw, rule, replacementUuid) {
  if (original?.type && newRaw?.type && original.type !== newRaw.type) return null;
  const data = buildReplacementData(original, newRaw, rule, replacementUuid);
  if (original?._id) data._id = original._id;
  return data;
}

/**
 * Old activity id → new activity id, so a pinned or favorited activity follows
 * its item. Matches by type and name, then by type alone when that is unique.
 * @returns {Map<string, string>}
 */
export function mapActivityIds(oldRaw, newRaw) {
  const mapped = new Map();
  const fresh = Object.entries(newRaw?.system?.activities ?? {});
  const taken = new Set();
  for (const [oldId, oldAct] of Object.entries(oldRaw?.system?.activities ?? {})) {
    const byName = fresh.find(
      ([id, a]) => !taken.has(id) && a.type === oldAct.type && a.name === oldAct.name,
    );
    const sameType = fresh.filter(([id, a]) => !taken.has(id) && a.type === oldAct.type);
    const pick = byName ?? (sameType.length === 1 ? sameType[0] : null);
    if (!pick) continue;
    taken.add(pick[0]);
    mapped.set(oldId, pick[0]);
  }
  return mapped;
}

/**
 * Point favorites or pins at the new item. Entries are `{ id: '.Item.abc' }` or
 * `{ id: '.Item.abc.Activity.xyz' }`. An activity with no counterpart on the new
 * item is dropped and counted, since its id would dangle.
 * @param {Array<{ id?: string }>} list
 * @param {string} oldId
 * @param {string} newId
 * @param {Map<string, string>} activities
 */
export function remapReferences(list, oldId, newId, activities) {
  const item = `.Item.${oldId}`;
  let changed = 0;
  let dropped = 0;
  const out = [];
  for (const entry of list ?? []) {
    const id = String(entry?.id ?? '');
    if (id === item) {
      out.push({ ...entry, id: `.Item.${newId}` });
      changed++;
    } else if (id.startsWith(`${item}.Activity.`)) {
      const next = activities.get(id.slice(`${item}.Activity.`.length));
      if (next) {
        out.push({ ...entry, id: `.Item.${newId}.Activity.${next}` });
        changed++;
      } else {
        dropped++;
      }
    } else {
      out.push(entry);
    }
  }
  return { list: out, changed, dropped };
}

/**
 * Remap an actor's system favorites, Tidy's per-tab pins, and Tidy's legacy
 * pin list in one go.
 * @returns {{ update: Record<string, unknown>, changed: number, dropped: number }}
 */
export function remapActorReferences(actorRaw, oldId, newId, activities) {
  const update = {};
  let changed = 0;
  let dropped = 0;
  const apply = (path, list) => {
    if (!Array.isArray(list)) return;
    const r = remapReferences(list, oldId, newId, activities);
    if (r.changed || r.dropped) update[path] = r.list;
    changed += r.changed;
    dropped += r.dropped;
  };

  apply('system.favorites', actorRaw.system?.favorites);

  const tidy = actorRaw.flags?.[TIDY_ID] ?? {};
  apply(`flags.${TIDY_ID}.sheetPins`, tidy.sheetPins);
  if (tidy.tabSheetPins && typeof tidy.tabSheetPins === 'object') {
    // Arrays replace rather than merge in an update, so a dropped pin goes.
    const pins = {};
    let touched = false;
    for (const [tab, list] of Object.entries(tidy.tabSheetPins)) {
      const r = Array.isArray(list)
        ? remapReferences(list, oldId, newId, activities)
        : { list, changed: 0, dropped: 0 };
      pins[tab] = r.list;
      changed += r.changed;
      dropped += r.dropped;
      touched ||= r.changed > 0 || r.dropped > 0;
    }
    if (touched) update[`flags.${TIDY_ID}.tabSheetPins`] = pins;
  }
  return { update, changed, dropped };
}

// --- references to a superseded document -------------------------------------
// A class or subclass grants spells and features by uuid, a feature can cast a
// spell by uuid, and any text can link one. A swap rewrites all of these.

/**
 * `@UUID[uuid]` or the old `@Compendium[scope.pack.id]`, with an optional
 * `{label}`. Foundry still resolves the old form as `Compendium.scope.pack.id`.
 */
const LINK = /@(UUID|Compendium)\[([^\]]+)\](?:\{([^}]*)\})?/g;
const linkUuid = (form, target) =>
  form === 'Compendium' ? `Compendium.${target}` : target;

/** Markup and enrichers, which a plain-text rename must not touch. */
const NOT_TEXT = /(<[^>]*>|@\w+\[[^\]]*\](?:\{[^}]*\})?)/;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rich-text fields that can hold links, on items and on actors. */
const TEXT_PATHS = [
  'system.description.value',
  'system.description.chat',
  'system.details.biography.value',
  'system.details.biography.public',
];

const getPath = (raw, path) =>
  path.split('.').reduce((node, key) => node?.[key], raw);

/** Parts naming a compendium ahead of its documents, which are no parent. */
const packParts = (parts) => (parts[0] === 'Compendium' ? 3 : 0);

/**
 * A relative uuid as a full one, read from the document holding it. Foundry
 * writes a link dropped into an actor's own biography as `.Item.id`, and one
 * between two items on the same actor as `.id`. Mirrors parseUuid in Foundry's
 * common/utils/helpers.mjs. Anything else comes back as it is.
 * @param {string} uuid
 * @param {string} [holderUuid]
 */
export function resolveRelativeUuid(uuid, holderUuid) {
  if (!uuid.startsWith('.') || !holderUuid) return uuid;
  let dots = 1;
  while (uuid[dots] === '.') dots++;
  const rest = uuid.slice(dots).split('.').filter(Boolean);
  const base = holderUuid.split('.');
  const top = packParts(base) + 2;
  for (let up = dots - 1; up > 0; up--) {
    if (base.length <= top) return uuid;
    base.length -= 2;
  }
  if (!rest.length) return base.join('.');
  if (rest.length % 2 === 0) return [...base, ...rest].join('.');
  // An id alone is a sibling: the holder's own type, in the holder's parent.
  if (base.length > top) return [...base.slice(0, -1), ...rest].join('.');
  return [...base.slice(0, packParts(base)), base.at(-2), ...rest].join('.');
}

/**
 * The relative form Foundry would write for `target` in `origin`'s text; a
 * target outside origin's actor stays absolute. A port of buildRelativeUuid in
 * Foundry's common/utils/helpers.mjs.
 */
export function relativeUuid(target, origin) {
  const n = origin.startsWith('Compendium.') ? 1 : 0;
  const parts = origin.split('.');
  let prefix = origin;
  let rel;
  let lastType;
  let k = 0;
  while (true) {
    if (target === prefix) {
      rel = '.';
      break;
    }
    if (target.startsWith(`${prefix}.`)) {
      rel = target.slice(prefix.length);
      if (lastType && rel.startsWith(`.${lastType}.`)) {
        rel = rel.slice(lastType.length + 1);
        k--;
      }
      break;
    }
    lastType = parts.at(-2);
    parts.length -= 2;
    if (parts.length <= n) {
      if (!target.startsWith(`${lastType}.`)) return target;
      rel = target.slice(lastType.length);
      break;
    }
    prefix = parts.join('.');
    k++;
  }
  return `${'.'.repeat(k)}${rel}`;
}

/** A grant or pool entry: `{ uuid }`, or a bare uuid in old data. */
const entryUuid = (entry) => (typeof entry === 'string' ? entry : entry?.uuid);

/**
 * Every uuid a document points at, and how. Kinds: `grant` (Item Grant
 * advancement, with its level), `choice` (an Item Choice pool), `cast` (a Cast
 * activity's spell), `link` (an @UUID in a description or biography).
 * @param {any} raw an item or actor, as `toObject()`
 * @returns {Array<{ uuid: string, kind: 'grant'|'choice'|'cast'|'link', level?: number }>}
 */
export function documentReferences(raw) {
  const found = [];
  for (const adv of Object.values(raw?.system?.advancement ?? {})) {
    const config = adv?.configuration ?? {};
    if (adv?.type === 'ItemGrant') {
      for (const entry of config.items ?? []) {
        const uuid = entryUuid(entry);
        if (uuid) found.push({ uuid, kind: 'grant', level: adv.level });
      }
    } else if (adv?.type === 'ItemChoice') {
      for (const entry of config.pool ?? []) {
        const uuid = entryUuid(entry);
        if (uuid) found.push({ uuid, kind: 'choice' });
      }
    }
  }
  for (const act of Object.values(raw?.system?.activities ?? {})) {
    if (act?.type === 'cast' && act.spell?.uuid)
      found.push({ uuid: act.spell.uuid, kind: 'cast' });
  }
  for (const path of TEXT_PATHS) {
    const text = getPath(raw, path);
    if (typeof text !== 'string') continue;
    for (const [, form, target] of text.matchAll(LINK))
      found.push({ uuid: linkUuid(form, target), kind: 'link' });
  }
  return found;
}

/**
 * @typedef {object} ReferenceSwap
 * @property {Map<string, string>} uuids old uuid → new uuid
 * @property {string} oldName a link labelled with this is relabelled
 * @property {string} newName
 * @property {string} [oldId] the actor item being replaced, when there is one
 * @property {string} [newId] the item replacing it
 * @property {string} [newUuid] where the new item came from
 * @property {boolean} [linksOnly] rewrite text only, not grants or Cast activities
 */

/** The current value at each path an update would write, to undo it later. */
export function previousValues(raw, update) {
  return Object.fromEntries(
    Object.keys(update).map((path) => [path, getPath(raw, path)]),
  );
}

/**
 * Advancement values record granted items by actor item id: Item Grant's
 * `added: { id: uuid }`, Item Choice's `added: { level: { id: uuid } }` and
 * `replaced`, an ASI feat's `feat: { id: uuid }`. Rename the old id, and point
 * its uuid at what the new item came from.
 */
function remapValueIds(node, swap, counter) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === swap.oldId) {
      out[swap.newId] =
        typeof value === 'string' && swap.newUuid ? swap.newUuid : value;
      counter.n++;
    } else if (value === swap.oldId) {
      out[key] = swap.newId;
      counter.n++;
    } else {
      out[key] = remapValueIds(value, swap, counter);
    }
  }
  return out;
}

/** Swap uuids in a grant list or pool, without listing the same one twice. */
function remapEntries(list, swap, counter) {
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const uuid = entryUuid(entry);
    const next = swap.uuids.get(uuid);
    if (next) counter.n++;
    const final = next ?? uuid;
    if (seen.has(final)) continue;
    seen.add(final);
    out.push(
      next ? (typeof entry === 'string' ? next : { ...entry, uuid: next }) : entry,
    );
  }
  return out;
}

/**
 * Rewrite links, relabelling ones that named the original. A relative link is
 * read from `holderUuid` and written back relative, as Foundry would.
 */
function remapLinks(text, swap, counter, holderUuid) {
  const oldName = normalizeName(swap.oldName);
  return text.replace(LINK, (whole, form, target, label) => {
    const next = swap.uuids.get(
      resolveRelativeUuid(linkUuid(form, target), holderUuid),
    );
    if (!next) return whole;
    counter.n++;
    const uuid =
      target.startsWith('.') && holderUuid ? relativeUuid(next, holderUuid) : next;
    if (label === undefined) return `@UUID[${uuid}]`;
    const relabel = oldName && normalizeName(label) === oldName;
    return `@UUID[${uuid}]{${relabel ? swap.newName : label}}`;
  });
}

/**
 * Rename the original where it is written as plain text: the exact name,
 * whole word, outside markup and enrichers. "daylight" in prose stays.
 */
function renameText(text, swap, counter) {
  const { oldName, newName } = swap;
  if (!oldName || !newName || oldName === newName) return text;
  const word = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(oldName)}(?![\\p{L}\\p{N}])`,
    'gu',
  );
  return text
    .split(NOT_TEXT)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(word, () => {
            counter.n++;
            return newName;
          }),
    )
    .join('');
}

/**
 * Point one document's references at the replacement.
 *
 * `advancement` is the item's whole advancement collection when it changed: a
 * renamed id key can only be dropped by replacing the collection, so the caller
 * writes it with Foundry's replace operator. Everything else is in `update`.
 * @param {any} raw an item or actor, as `toObject()`
 * @param {ReferenceSwap} swap
 * @param {string} [holderUuid] the document's own uuid, for relative links
 * @returns {{ update: Record<string, unknown>, advancement: Record<string, any>|null, count: number }}
 */
export function rewriteReferences(raw, swap, holderUuid) {
  const update = {};
  const total = { n: 0 };

  // Links only: grants and Cast activities are left to dnd5e and Replace.
  const advancement = clone(swap.linksOnly ? {} : raw?.system?.advancement ?? {});
  const before = total.n;
  for (const adv of Object.values(advancement)) {
    if (!adv || typeof adv !== 'object') continue;
    const config = adv.configuration ?? {};
    if (adv.type === 'ItemGrant' && Array.isArray(config.items))
      config.items = remapEntries(config.items, swap, total);
    if (adv.type === 'ItemChoice' && Array.isArray(config.pool))
      config.pool = remapEntries(config.pool, swap, total);
    if (swap.oldId && adv.value) adv.value = remapValueIds(adv.value, swap, total);
  }
  const advanced = total.n > before;

  const activities = swap.linksOnly ? {} : raw?.system?.activities ?? {};
  for (const [id, act] of Object.entries(activities)) {
    const next = act?.type === 'cast' && swap.uuids.get(act.spell?.uuid);
    if (!next) continue;
    update[`system.activities.${id}.spell.uuid`] = next;
    total.n++;
  }

  const texts = new Map();
  for (const path of TEXT_PATHS) {
    const text = getPath(raw, path);
    if (typeof text === 'string')
      texts.set(path, remapLinks(text, swap, total, holderUuid));
  }
  // Plain-text names only where the document references the original some
  // other way too (a class table listing the spell it grants), so lore that
  // happens to use the word is left alone.
  if (total.n) {
    for (const [path, text] of texts) texts.set(path, renameText(text, swap, total));
  }
  for (const [path, text] of texts) {
    if (text !== getPath(raw, path)) update[path] = text;
  }

  // Items the old one granted (a replaced subclass's features) follow it.
  if (swap.oldId) {
    const dnd = raw?.flags?.dnd5e ?? {};
    for (const key of ['advancementOrigin', 'advancementRoot']) {
      if (String(dnd[key] ?? '').startsWith(`${swap.oldId}.`)) {
        update[`flags.dnd5e.${key}`] = `${swap.newId}${dnd[key].slice(swap.oldId.length)}`;
        total.n++;
      }
    }
  }

  return { update, advancement: advanced ? advancement : null, count: total.n };
}

/**
 * Pick the replacement among same-named candidates by source label.
 * @param {Array<{ source: string }>} candidates
 * @param {string} source
 * @returns {number} index, or -1 when it can't be told
 */
export function pickBySource(candidates, source) {
  const exact = candidates.findIndex((c) => sourceMatches(c.source, source) && normalizeName(c.source));
  if (exact >= 0) return exact;
  return candidates.length === 1 ? 0 : -1;
}

/**
 * Every same-named candidate for the GM to choose from, the one pickBySource
 * would take first and marked `suggested`. When it can't tell, none is.
 * @template {{ source: string }} T
 * @param {T[]} candidates
 * @param {string} source
 * @returns {Array<T & { suggested: boolean }>}
 */
export function orderCandidates(candidates, source) {
  const at = pickBySource(candidates, source);
  const marked = candidates.map((c, i) => ({ ...c, suggested: i === at }));
  return at < 0 ? marked : [marked[at], ...marked.filter((_, i) => i !== at)];
}

/**
 * A stable name for a rule, for "allowed on this sheet" lists. Rule ids are
 * positions, which shift whenever a mapping is added; this does not.
 */
export const ruleKey = (rule) =>
  `${normalizeName(rule.originalName)}|${normalizeName(rule.originalSource)}`;

/** Parse the stored rule list; anything unreadable is "no rules". */
export function parseRules(text) {
  try {
    const list = JSON.parse(String(text ?? '[]'));
    return Array.isArray(list) ? list.filter((r) => r?.originalName) : [];
  } catch {
    return [];
  }
}
