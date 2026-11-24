// Supersession mapping graph builder, cycle collapse, entity lookups, and cache warming.

export const MAX_CHAIN = 16;
export const FILTER_HEADER = 'Replacements';
export const FILTER_OVERRIDDEN = 'Overridden';
export const FILTER_REPLACED = 'Replaced';

export const buildTarget = ({ spec, page, prop, label, problems }) => {
  if (!spec?.uid) {
    problems.push(`${label}: a "replacedBy" entry is missing "uid"`);
    return null;
  }

  const toProp = spec.prop || prop;
  const toPage = spec.page || page;
  const toTag = spec.tag || (toProp ? Parser.getPropTag(toProp) : null);

  const builder = UrlUtil.URL_TO_HASH_BUILDER[toProp] || UrlUtil.URL_TO_HASH_BUILDER[toPage];
  if (!builder) {
    problems.push(`${label}: no hash builder for "${toProp || toPage}"`);
    return null;
  }

  let unpacked;
  try {
    unpacked = DataUtil.proxy.unpackUid(toProp, spec.uid, toTag);
  } catch {
    problems.push(`${label}: could not unpack uid "${spec.uid}"`);
    return null;
  }

  return {
    page: toPage,
    hash: builder(unpacked),
    name: unpacked.name,
    source: unpacked.source,
    prop: toProp,
    uid: spec.uid,
    tag: toTag,
  };
};

export const buildEdge = (row, problems) => {
  const { page, hash, prop, replacedBy } = row || {};
  const label = `${row?.displayName || hash || '?'} (${page || '?'})`;

  // One original may be replaced by several entities; accept either shape.
  const tos = replacedBy == null ? [] : [replacedBy].flat();

  if (!page || !hash || !tos.length) {
    problems.push(`${label}: needs "page", "hash", and "replacedBy"`);
    return null;
  }

  const to = [];
  for (const spec of tos) {
    const built = buildTarget({ spec, page, prop, label, problems });
    if (!built) return null;
    if (built.page === page && built.hash === hash) {
      problems.push(`${label}: replaced by itself`);
      return null;
    }
    if (to.some((it) => it.page === built.page && it.hash === built.hash)) continue;
    to.push(built);
  }

  if (!to.length) return null;

  return { from: { page, hash }, to };
};

export const getTerminal = ({ fwd, from, to, maxChain = MAX_CHAIN }) => {
  const seen = new Set([`${from.page}|${from.hash}`]);
  let cur = to;

  for (let i = 0; i < maxChain; ++i) {
    const key = `${cur.page}|${cur.hash}`;
    if (seen.has(key)) return null;
    seen.add(key);

    const nxt = fwd[cur.page]?.[cur.hash]?.[0];
    if (!nxt) break;
    cur = nxt;
  }

  return cur;
};

/**
 * Collapse A->B->C into A->C so a redirect lands somewhere terminal, and drop any
 * edge that loops back on itself. A chain is followed through each hop's primary.
 * @returns {Record<string, Record<string, any[]>>}
 */
export const resolveGraph = (fwd, problems, maxChain = MAX_CHAIN) => {
  /** @type {Record<string, Record<string, any[]>>} */
  const out = {};

  for (const [page, byHash] of Object.entries(fwd)) {
    for (const [hash, tos] of Object.entries(byHash)) {
      const resolved = [];
      let isCycle = false;

      for (const to of tos) {
        const end = getTerminal({ fwd, from: { page, hash }, to, maxChain });
        if (!end) {
          isCycle = true;
          break;
        }
        if (!resolved.some((it) => it.page === end.page && it.hash === end.hash)) {
          resolved.push(end);
        }
      }

      if (isCycle) {
        problems.push(`${hash} (${page}): supersession cycle`);
        continue;
      }
      MiscUtil.set(out, page, hash, resolved);
    }
  }

  return out;
};

/**
 * @returns {Record<string, Record<string, any[]>>}
 */
export const buildReverse = (fwd, origins) => {
  /** @type {Record<string, Record<string, any[]>>} */
  const out = {};

  for (const [page, byHash] of Object.entries(fwd)) {
    for (const [hash, tos] of Object.entries(byHash)) {
      let decoded = null;
      try {
        decoded = UrlUtil.autoDecodeHash(hash, { page });
      } catch {
        decoded = null;
      }

      const origin = origins[page]?.[hash] || {};
      const name = origin.name || (decoded?.name || hash).toTitleCase();
      const source = origin.source || decoded?.source;

      for (const to of tos) {
        MiscUtil.getOrSet(out, to.page, to.hash, []).push({ page, hash, name, source });
      }
    }
  }

  return out;
};

export const buildGraph = (rows, maxChain = MAX_CHAIN) => {
  const fwd = {};
  const problems = [];
  // Hashes are lowercased, so neither the name nor the source decoded back out of
  // one is usable: the name reads wrong, and a lowercased source misses
  // Parser.SOURCE_JSON_TO_FULL entirely. Keep what the mapping declared.
  const origins = {};
  const overridden = new Set();

  for (const row of rows) {
    const built = buildEdge(row, problems);
    if (!built) continue;
    MiscUtil.set(fwd, built.from.page, built.from.hash, built.to);
    if (row.displayName || row.source) {
      MiscUtil.set(origins, built.from.page, built.from.hash, {
        name: row.displayName,
        source: row.source,
      });
    }
    if (typeof row.override === 'string') {
      overridden.add(`${built.from.page}|${built.from.hash}`);
    }
  }

  const resolvedFwd = resolveGraph(fwd, problems, maxChain);
  const rev = buildReverse(resolvedFwd, origins);
  return { fwd: resolvedFwd, rev, overridden, problems };
};

export const isSourceAvailable = (source) => {
  if (!source) return false;
  if (typeof BrewUtil2 !== 'undefined' && BrewUtil2.hasSourceJson(source)) return true;
  if (typeof PrereleaseUtil !== 'undefined' && PrereleaseUtil.hasSourceJson(source)) return true;
  if (typeof SourceUtil !== 'undefined' && SourceUtil.isSiteSource(source)) return true;
  return false;
};

export const getEntPageHash = (ent, { page, prop } = {}) => {
  if (!ent) return null;

  const resolvedProp = ent.__prop || prop;
  const builder = UrlUtil.URL_TO_HASH_BUILDER[resolvedProp] || UrlUtil.URL_TO_HASH_BUILDER[page];
  if (!builder) return null;

  const pageOut = page || UrlUtil.PROP_TO_PAGE[resolvedProp];
  if (!pageOut) return null;

  try {
    return { page: pageOut, hash: builder(ent) };
  } catch {
    return null;
  }
};

/**
 * Every replacement that is currently in force, primary first.
 * @returns {any[]}
 */
export const getReplacements = (api, { page, hash }) => {
  if (!api.isInitialised || !page || !hash) return [];

  const tos = api._fwd[page]?.[hash];
  if (!tos?.length) return [];

  return tos.filter((to) => {
    // A replacement from a source the user has not loaded is not a replacement.
    if (!api._isSourceAvailable(to.source)) return false;

    // Mirrors Renderer.redirect.getRedirectByHash: blocklisting the replacement
    // restores the original rather than stranding the user on a hidden entity.
    if (
      typeof ExcludeUtil !== 'undefined' &&
      ExcludeUtil.isInitialised &&
      ExcludeUtil.isExcluded(to.hash, to.prop, to.source, { isNoCount: true })
    ) {
      return false;
    }

    return true;
  });
};

/**
 * The other replacements of the same original, to render beneath this one. Only the
 * primary reports siblings; otherwise each sibling would stack the rest in turn.
 */
export const getStackedSiblings = (api, ent, { page } = {}) => {
  if (!api.isInitialised || api._isStacking) return [];

  const pageHash = api._getEntPageHash(ent, { page });
  if (!pageHash) return [];

  const originals = api._rev[pageHash.page]?.[pageHash.hash];
  if (!originals?.length) return [];

  const out = [];
  const seen = new Set([`${pageHash.page}|${pageHash.hash}`]);

  for (const original of originals) {
    const all = api.getReplacements({ page: original.page, hash: original.hash });
    if (all.length < 2) continue;
    if (all[0].page !== pageHash.page || all[0].hash !== pageHash.hash) continue;

    for (const to of all.slice(1)) {
      const key = `${to.page}|${to.hash}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(to);
    }
  }

  return out;
};

export const getSupersededBy = (api, { page, hash }) => {
  if (!api.isInitialised || !page || !hash) return null;
  const out = api._rev[page]?.[hash];
  if (!out?.length) return null;
  // Only offer the swap-back for mappings that are actually in force.
  const filtered = out.filter((it) => api.getReplacement({ page: it.page, hash: it.hash }));
  return filtered.length ? filtered : null;
};

/** Which Replacements-filter pills an original carries: one, or none if it isn't mapped. */
export const getFilterValues = (api, { page, hash } = {}) => {
  if (!page || !hash || !api._fwd[page]?.[hash]) return [];
  return api._overridden.has(`${page}|${hash}`) ? [api._FILTER_OVERRIDDEN] : [api._FILTER_REPLACED];
};

export const warmOne = (to) => {
  if (typeof DataLoader === 'undefined') return;
  try {
    DataLoader.pCacheAndGet(to.page, to.source, to.hash, {
      isSilent: true,
      isOptimisticPrereleaseBrew: true,
    }).then(null, () => {});
  } catch {
    // Nothing to do; the sibling simply will not stack.
  }
};

/**
 * Siblings render synchronously alongside the primary, so they have to already be in
 * the DataLoader cache by then. Warm them up front; misses at render time kick off
 * another fetch so a later render succeeds.
 */
export const warmCache = (fwd, warmOneFn = warmOne) => {
  if (typeof DataLoader === 'undefined') return;

  for (const byHash of Object.values(fwd)) {
    for (const tos of Object.values(byHash)) {
      // The primary is fetched by the navigation/hover that displays it.
      for (const to of tos.slice(1)) warmOneFn(to);
    }
  }
};
