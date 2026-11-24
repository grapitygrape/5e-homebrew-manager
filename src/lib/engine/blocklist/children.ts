/**
 * engine/blocklist/children.ts — parent → child relationships for cascading
 * blocklist edits.
 *
 * INTENT
 *   Blocking a parent entity (a Class, a base Race, a Base Item, an Item Group,
 *   a Deck, or a summoning Spell) leaves its structural children orphaned across
 *   official and homebrew sources — e.g. blocking `Artificer (TCE)` leaves 15
 *   Artificer subclasses across TCE and homebrew books still unblocked.
 *
 *   This module holds the pure side of cascading: extracting parent/child edges
 *   from raw 5etools records, traversing descendants, deciding which children
 *   actually need rules added or removed against the working blocklist, finding
 *   allowed children whose parents are blocked, and formatting confirmation
 *   prompt copy. No I/O.
 */
import { BLOCKLIST_PROP_ORDER, propLabel } from './catalog.ts';
import { entryKey } from './entries.ts';
import type { BlocklistEntry } from './entries.ts';
import { encodeForHash, entitySource } from './hash.ts';
import type { IndexedEntity } from './diagnose.ts';

/** Key identifying one entity in the parent → child graph (`prop|hash`, lowercased). */
export const entityGraphKey = (prop: string, hash: string): string =>
  `${prop.toLowerCase()}|${hash.toLowerCase()}`;

export interface ParentLinkRef {
  parentProp: string;
  parentHash: string;
}

export interface ItemGroupMemberRef {
  name: string;
  source: string;
  fallbackSource?: string;
}

export interface TargetRuleSpec {
  hash: string;
  category: string;
  source: string;
  displayName?: string;
}

export interface BlockedParentRef {
  prop: string;
  name: string;
  source: string;
  hash: string;
}

export interface AllowedChildWithBlockedParent extends IndexedEntity {
  /** Blocked parent/ancestor entities that this allowed entity depends on. */
  blockedParents: BlockedParentRef[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function splitPipeUid(
  raw: string,
  defaultSource: string,
): { name: string; source: string; explicitSource: boolean } | null {
  const parts = raw.split('|');
  const name = (parts[0] ?? '').trim();
  if (!name) return null;
  const explicit = (parts[1] ?? '').trim();
  return {
    name,
    source: explicit || defaultSource,
    explicitSource: Boolean(explicit),
  };
}

/**
 * Direct parent references expressed on a child entity. Races come from
 * `flattenRacesWithParents` instead, because base races can be renamed
 * `Race (Base)`; `itemGroup` → members points parent-to-child.
 */
export function extractParentLinks(
  prop: string,
  raw: Record<string, unknown>,
): ParentLinkRef[] {
  const out: ParentLinkRef[] = [];

  if (prop === 'subclass') {
    const className = str(raw.className);
    const classSource = str(raw.classSource) || entitySource(raw);
    if (className && classSource) {
      out.push({
        parentProp: 'class',
        parentHash: encodeForHash(className, classSource),
      });
    }
    return out;
  }

  if (prop === 'item' && typeof raw.baseItem === 'string') {
    const parsed = splitPipeUid(raw.baseItem, 'PHB');
    if (parsed) {
      out.push({
        parentProp: 'baseitem',
        parentHash: encodeForHash(parsed.name, parsed.source),
      });
    }
    return out;
  }

  if (prop === 'card') {
    const set = str(raw.set);
    const source = entitySource(raw);
    if (set && source) {
      out.push({
        parentProp: 'deck',
        parentHash: encodeForHash(set, source),
      });
    }
    return out;
  }

  if (prop === 'monster' && typeof raw.summonedBySpell === 'string') {
    const parsed = splitPipeUid(raw.summonedBySpell, 'PHB');
    if (parsed) {
      out.push({
        parentProp: 'spell',
        parentHash: encodeForHash(parsed.name, parsed.source),
      });
    }
    return out;
  }

  return out;
}

/** Member item references declared on an `itemGroup`. */
export function extractItemGroupMembers(
  prop: string,
  raw: Record<string, unknown>,
): ItemGroupMemberRef[] {
  if (prop !== 'itemGroup' || !Array.isArray(raw.items)) return [];
  const ownSource = entitySource(raw);
  const out: ItemGroupMemberRef[] = [];
  for (const item of raw.items) {
    if (typeof item !== 'string') continue;
    const parsed = splitPipeUid(item, 'DMG');
    if (!parsed) continue;
    out.push({
      name: parsed.name,
      source: parsed.source,
      fallbackSource:
        !parsed.explicitSource && ownSource && ownSource.toUpperCase() !== 'DMG'
          ? ownSource
          : undefined,
    });
  }
  return out;
}

const propRank = new Map(BLOCKLIST_PROP_ORDER.map((p, i) => [p, i]));

const byPropThenName = (a: IndexedEntity, b: IndexedEntity): number =>
  (propRank.get(a.prop) ?? 999) - (propRank.get(b.prop) ?? 999) ||
  a.name.localeCompare(b.name) ||
  a.source.localeCompare(b.source);

/**
 * BFS over the parent → child graph from one or more parent seeds.
 * Seeds themselves are excluded from the result; cycles are ignored.
 */
export function collectDescendants(
  seeds: IndexedEntity[],
  childrenOf: (graphKey: string) => readonly IndexedEntity[] | undefined,
): IndexedEntity[] {
  const seedKeys = new Set<string>();
  const queue: IndexedEntity[] = [];
  for (const s of seeds) {
    const k = entityGraphKey(s.prop, s.hash);
    if (seedKeys.has(k)) continue;
    seedKeys.add(k);
    queue.push(s);
  }

  const visited = new Set<string>(seedKeys);
  const out: IndexedEntity[] = [];

  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const kids = childrenOf(entityGraphKey(cur.prop, cur.hash));
    if (!kids?.length) continue;
    for (const kid of kids) {
      const k = entityGraphKey(kid.prop, kid.hash);
      if (visited.has(k)) continue;
      visited.add(k);
      out.push(kid);
      queue.push(kid);
    }
  }

  out.sort(byPropThenName);
  return out;
}

/** Every wildcard combination 5etools checks (`ExcludeUtil._getCacheUids`). */
function isEntityBlockedBy(
  ruleKeys: Set<string>,
  child: IndexedEntity,
): boolean {
  const h = child.hash.toLowerCase();
  const c = child.prop.toLowerCase();
  const s = child.source.toLowerCase();
  return (
    ruleKeys.has(`${h}__${c}__${s}`) ||
    ruleKeys.has(`*__${c}__${s}`) ||
    ruleKeys.has(`${h}__*__${s}`) ||
    ruleKeys.has(`${h}__${c}__*`) ||
    ruleKeys.has(`*__*__${s}`) ||
    ruleKeys.has(`*__${c}__*`) ||
    ruleKeys.has(`${h}__*__*`) ||
    ruleKeys.has(`*__*__*`)
  );
}

/**
 * Every allowed entity in the graph that has at least one blocked ancestor
 * under `entries`. Sorted by prop order, name, and source.
 */
export function findAllowedWithBlockedParents(
  parents: Iterable<IndexedEntity>,
  childrenOf: (graphKey: string) => readonly IndexedEntity[] | undefined,
  entries: Pick<BlocklistEntry, 'hash' | 'category' | 'source'>[],
): AllowedChildWithBlockedParent[] {
  if (!entries.length) return [];
  const ruleKeys = new Set(entries.map(entryKey));
  const byChildKey = new Map<string, AllowedChildWithBlockedParent>();

  for (const parent of parents) {
    if (!isEntityBlockedBy(ruleKeys, parent)) continue;
    const descendants = collectDescendants([parent], childrenOf);
    for (const child of descendants) {
      if (isEntityBlockedBy(ruleKeys, child)) continue;
      const key = entityGraphKey(child.prop, child.hash);
      let rec = byChildKey.get(key);
      if (!rec) {
        rec = { ...child, blockedParents: [] };
        byChildKey.set(key, rec);
      }
      const pKey = entityGraphKey(parent.prop, parent.hash);
      if (
        !rec.blockedParents.some(
          (p) => entityGraphKey(p.prop, p.hash) === pKey,
        )
      ) {
        rec.blockedParents.push({
          prop: parent.prop,
          name: parent.name,
          source: parent.source,
          hash: parent.hash,
        });
      }
    }
  }

  const out = [...byChildKey.values()];
  for (const item of out) {
    item.blockedParents.sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
    );
  }
  out.sort(byPropThenName);
  return out;
}

export type CascadeMode = 'block' | 'unblock';

const ruleFor = (child: IndexedEntity): BlocklistEntry => ({
  displayName: child.name,
  hash: child.hash,
  category: child.prop,
  source: child.source,
  isAuto: false,
});

/**
 * The children a parent change should offer to carry along, given the entries
 * with the parent change already applied.
 *
 * block   - children nothing in `entries` blocks yet (so a whole-source parent
 *           skips its own same-source children).
 * unblock - children still held by an exact, user-removable rule. Children
 *           blocked only by a wildcard elsewhere are left alone so we never
 *           shatter a whole-source block.
 */
export function cascadeCandidates(
  mode: CascadeMode,
  children: IndexedEntity[],
  entries: BlocklistEntry[],
): IndexedEntity[] {
  if (mode === 'block') {
    const ruleKeys = new Set(entries.map(entryKey));
    return children.filter((c) => !isEntityBlockedBy(ruleKeys, c));
  }
  const removable = new Set(
    entries
      .filter((e) => !e.isAuto && e.hash !== '*' && e.category !== '*')
      .map(entryKey),
  );
  return children.filter((c) => removable.has(entryKey(ruleFor(c))));
}

/**
 * Add (block) or remove (unblock) exact rules for `children`. Adding never
 * duplicates a rule already present; removing never touches auto rules.
 */
export function applyCascade(
  mode: CascadeMode,
  entries: BlocklistEntry[],
  children: IndexedEntity[],
): BlocklistEntry[] {
  if (!children.length) return entries;
  if (mode === 'unblock') {
    const doomed = new Set(children.map((c) => entryKey(ruleFor(c))));
    return entries.filter((e) => e.isAuto || !doomed.has(entryKey(e)));
  }
  const present = new Set(entries.map(entryKey));
  const extra: BlocklistEntry[] = [];
  for (const child of children) {
    const rule = ruleFor(child);
    const key = entryKey(rule);
    if (present.has(key)) continue;
    present.add(key);
    extra.push(rule);
  }
  return extra.length ? [...entries, ...extra] : entries;
}

const CHILD_NOUNS: Record<string, [string, string]> = {
  subclass: ['subclass', 'subclasses'],
  subrace: ['subrace', 'subraces'],
  race: ['race variant', 'race variants'],
  item: ['item', 'items'],
  baseitem: ['base item', 'base items'],
  card: ['card', 'cards'],
  monster: ['creature', 'creatures'],
};

function nounFor(prop: string, count: number): string {
  const pair = CHILD_NOUNS[prop];
  if (pair) return count === 1 ? pair[0] : pair[1];
  return propLabel(prop).toLowerCase();
}

/** Human-readable count summary, e.g. `"15 subclasses"` or `"3 items and 2 creatures"`. */
export function describeChildSummary(children: IndexedEntity[]): string {
  const counts = new Map<string, number>();
  for (const c of children) {
    counts.set(c.prop, (counts.get(c.prop) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(
    ([prop, n]) => `${n} ${nounFor(prop, n)}`,
  );
  if (parts.length <= 1) return parts[0] ?? '0 items';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** Human-readable label for the parent being toggled. */
export function describeTargetLabel(target: TargetRuleSpec): string {
  if (target.hash === '*' && target.category === '*') return target.source;
  if (target.hash === '*') return `${propLabel(target.category)} (${target.source})`;
  const name = target.displayName || target.hash;
  return `${name} (${target.source})`;
}
