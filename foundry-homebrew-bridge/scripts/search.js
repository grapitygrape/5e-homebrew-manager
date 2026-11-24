/**
 * search.js — find homebrew entries among this world's Items.
 *
 * INTENT
 *   Answer a `FoundryQuery` from the manager: for each candidate name, which
 *   Foundry documents match, and do they have art / prose / activities?
 *
 * TWO PHASES, and the reason for them
 *   Phase 1 matches on *names only*, using each pack's index. Foundry already
 *   keeps those in memory and they're tiny (name, type, img, uuid). Registering
 *   `system.description.value` and `system.activities` as extra index fields
 *   would work — but it would pull the full prose of every item in every
 *   installed compendium into memory, permanently, to answer a question about
 *   twenty of them.
 *
 *   Phase 2 therefore loads *only the documents that matched* and runs the
 *   three checks on those. A typical homebrew file resolves to a few dozen
 *   `getDocument` calls instead of indexing tens of thousands of entries.
 *
 * FUZZY COST CONTROL
 *   Exact and normalized matching are Map lookups. Fuzzy is O(candidates ×
 *   entries), so it only runs for candidates that found nothing, and only
 *   against entries in a plausible length window sharing a first letter.
 */

import CONSTANTS from './constants.js';
import { prepareName, scoreNames } from './lib/match.js';
import { inspectDocument } from './lib/inspect.js';

/** @typedef {{ uuid: string, id: string, name: string, docType: string, img: string, pack: string, packLabel: string, prepared: ReturnType<typeof prepareName>, doc: object|null }} IndexEntry */

/** Built lazily on first query, dropped when compendium contents change. */
let cache = null;

/** Drop the cached index — call when packs or world items change. */
export function invalidateIndex() {
  cache = null;
}

const setting = (key) => game.settings.get(CONSTANTS.MODULE_ID, key);

/** Pack ids/prefixes the user asked to skip. */
function excludedPacks() {
  return String(setting(CONSTANTS.SETTINGS.EXCLUDE_PACKS) || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isExcluded(collection, excludes) {
  const id = collection.toLowerCase();
  return excludes.some((ex) => id === ex || id.startsWith(ex));
}

/**
 * Every Item this world can see, name-indexed. Compendium entries carry no
 * document body yet (`doc: null`); world items already have theirs.
 * @returns {Promise<{ entries: IndexEntry[], byNorm: Map<string, IndexEntry[]>, packs: number }>}
 */
export async function buildIndex() {
  if (cache) return cache;

  const excludes = excludedPacks();
  /** @type {IndexEntry[]} */
  const entries = [];
  let packs = 0;

  // --- compendiums ---------------------------------------------------------
  const itemPacks = game.packs.filter(
    (p) => p.documentName === 'Item' && !isExcluded(p.collection, excludes),
  );

  // Foundry ships every pack's index with the world, and keeps it current.
  // getIndex() would refetch any pack nothing has asked for yet, empty ones
  // included, and right after a reload that took the server seconds; names,
  // types and images are all we read, and the shipped index has them.
  for (const pack of itemPacks) {
    packs++;
    const packLabel = pack.metadata?.label ?? pack.collection;
    for (const entry of pack.index) {
      if (!entry?.name) continue;
      entries.push({
        uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`,
        id: entry._id,
        name: entry.name,
        docType: entry.type ?? '',
        img: entry.img ?? '',
        pack: pack.collection,
        packLabel,
        prepared: prepareName(entry.name),
        doc: null,
      });
    }
  }

  // --- the world's own Items -----------------------------------------------
  if (setting(CONSTANTS.SETTINGS.INCLUDE_WORLD)) {
    packs++;
    for (const item of game.items) {
      entries.push({
        uuid: item.uuid,
        id: item.id,
        name: item.name,
        docType: item.type ?? '',
        img: item.img ?? '',
        pack: 'world',
        packLabel: game.i18n.localize('HM-BRIDGE.world-items'),
        prepared: prepareName(item.name),
        doc: item,
      });
    }
  }

  // Two lookup structures, one per fuzzy measure:
  //   byNorm   normalized name → entries. The fast path for exact/normalized.
  //   byToken  identity token → entries. Lets the token-overlap measure find
  //            "Zariel's Sword" from "Sword of Zariel" without scanning
  //            everything — a first-letter prefilter would rule that pair out
  //            before scoring it, which is the whole case fuzzy exists for.
  const byNorm = new Map();
  const byToken = new Map();
  const push = (map, key, entry) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(entry);
    else map.set(key, [entry]);
  };

  for (const entry of entries) {
    push(byNorm, entry.prepared.norm, entry);
    for (const token of entry.prepared.tokens) push(byToken, token, entry);
  }

  cache = { entries, byNorm, byToken, packs };
  return cache;
}

/**
 * Length prefilter for the edit-distance measure: a name more than ~60% longer
 * or shorter than the query can't clear a 0.7 Levenshtein ratio, so scoring it
 * is wasted work.
 */
function withinLengthWindow(queryNorm, entryNorm) {
  if (!queryNorm || !entryNorm) return false;
  const ratio = queryNorm.length / entryNorm.length;
  return ratio >= 0.6 && ratio <= 1.6;
}

/**
 * The entries worth scoring for a fuzzy query — the union of:
 *   • everything sharing at least one identity token (catches word-order
 *     swaps and possessives), and
 *   • everything of a similar length starting with the same letter (catches
 *     typos, where the tokens themselves differ: "Flametounge"/"Flametongue").
 *
 * Without the first branch, reordered names are never even considered; without
 * the second, typos aren't. Both are cheap set operations over the index.
 *
 * @returns {Set<IndexEntry>}
 */
function fuzzyShortlist(prepared, index) {
  const shortlist = new Set();

  for (const token of prepared.tokens) {
    for (const entry of index.byToken.get(token) ?? []) shortlist.add(entry);
  }

  const first = prepared.norm[0];
  if (first) {
    for (const entry of index.entries) {
      if (entry.prepared.norm[0] !== first) continue;
      if (withinLengthWindow(prepared.norm, entry.prepared.norm))
        shortlist.add(entry);
    }
  }

  return shortlist;
}

/**
 * Load the bodies of compendium entries so they can be read. World items
 * already hold theirs, and a loaded body stays on its entry until the index is
 * rebuilt, past Foundry's own five-minute cache. One request per pack rather
 * than per entry. Failures degrade to "nothing found" rather than failing the
 * whole request.
 * @param {IndexEntry[]} entries
 */
export async function loadBodies(entries) {
  const byPack = new Map();
  for (const entry of entries) {
    if (entry.doc) continue;
    const list = byPack.get(entry.pack);
    if (list) list.push(entry);
    else byPack.set(entry.pack, [entry]);
  }
  await Promise.all(
    [...byPack].map(async ([collection, list]) => {
      try {
        const docs = await game.packs
          .get(collection)
          ?.getDocuments({ _id__in: list.map((e) => e.id) });
        const byId = new Map((docs ?? []).map((d) => [d.id, d]));
        for (const entry of list) entry.doc = byId.get(entry.id) ?? null;
      } catch (err) {
        console.warn(`${CONSTANTS.MODULE_ID} | could not load from ${collection}`, err);
      }
    }),
  );
}

/**
 * Run one query from the manager.
 *
 * @param {{ candidates: Array<object>, options: { fuzzy: boolean, fuzzyThreshold: number, maxMatches: number } }} query
 * @returns {Promise<{ results: Array<{id: string, matches: object[]}>, searched: {packs: number, documents: number} }>}
 */
export async function runQuery(query) {
  const index = await buildIndex();
  const { entries, byNorm, packs } = index;
  const options = query.options ?? {};
  const fuzzy = options.fuzzy !== false;
  const fuzzyThreshold = Number(options.fuzzyThreshold ?? 0.72);
  const maxMatches = Math.max(1, Number(options.maxMatches ?? 8));

  /** Deduped set of entries we'll need bodies for. */
  const needBody = new Map();
  /** candidateId → [{ entry, kind, score, typeMatch }] */
  const hits = new Map();

  for (const candidate of query.candidates ?? []) {
    const prepared = prepareName(candidate.name);
    const expect = Array.isArray(candidate.expect) ? candidate.expect : [];
    const scored = [];

    // Pass 1 + 2: exact / normalized, via the bucket map.
    for (const entry of byNorm.get(prepared.norm) ?? []) {
      const s = scoreNames(prepared, entry.prepared, { fuzzy: false });
      if (s) scored.push({ entry, ...s });
    }

    // Pass 3: fuzzy — only when nothing landed, and only over the shortlist.
    if (scored.length === 0 && fuzzy) {
      for (const entry of fuzzyShortlist(prepared, index)) {
        const s = scoreNames(prepared, entry.prepared, {
          fuzzy: true,
          fuzzyThreshold,
        });
        if (s) scored.push({ entry, ...s });
      }
    }

    // Prefer the expected subtype, then score, before truncating.
    for (const hit of scored) {
      hit.typeMatch = expect.length === 0 || expect.includes(hit.entry.docType);
    }
    scored.sort(
      (a, b) => Number(b.typeMatch) - Number(a.typeMatch) || b.score - a.score,
    );
    const top = scored.slice(0, maxMatches);

    for (const hit of top) needBody.set(hit.entry.uuid, hit.entry);
    hits.set(candidate.id, top);
  }

  // Phase 2 — load only what matched, then inspect.
  const bodies = [...needBody.values()];
  await loadBodies(bodies);

  /** @type {Map<string, object>} */
  const inspected = new Map();
  for (const entry of bodies) {
    const raw = entry.doc
      ? (entry.doc.toObject?.() ?? entry.doc)
      : { img: entry.img };
    inspected.set(entry.uuid, inspectDocument(raw));
  }

  const results = [];
  for (const [id, top] of hits) {
    results.push({
      id,
      matches: top.map((hit) => ({
        uuid: hit.entry.uuid,
        name: hit.entry.name,
        docType: hit.entry.docType,
        pack: hit.entry.pack,
        packLabel: hit.entry.packLabel,
        matchKind: hit.kind,
        score: hit.score,
        typeMatch: hit.typeMatch,
        ...(inspected.get(hit.entry.uuid) ?? {
          img: hit.entry.img,
          hasImage: false,
          hasDescription: false,
          descriptionChars: 0,
          activityCount: 0,
          activityTypes: [],
          source: '',
          sourceIds: [],
        }),
      })),
    });
  }

  return { results, searched: { packs, documents: entries.length } };
}
