/**
 * lib/services/content-index-graph.ts — resolves the parent → child links a
 * scan deferred (subclasses, merged subraces, item-group members) into the
 * graph behind cascading blocklist rules. Runs once, after every file is in.
 */
import {
  encodeForHash,
  entityGraphKey,
  entityHash,
} from '$lib/engine/blocklist';
import type {
  FlattenedRacesResult,
  IndexedEntity,
} from '$lib/engine/blocklist';
import type { Accumulator } from './content-index-accumulator';

export interface ChildrenGraph {
  childrenByParent: Map<string, IndexedEntity[]>;
  parents: Map<string, IndexedEntity>;
  /** `parentKey>childKey`, so a child listed twice under one parent stays one edge. */
  edges: Set<string>;
}

function addChildEdge(
  graph: ChildrenGraph,
  parent: IndexedEntity,
  child: IndexedEntity,
): void {
  const pKey = entityGraphKey(parent.prop, parent.hash);
  const cKey = entityGraphKey(child.prop, child.hash);
  const edge = `${pKey}>${cKey}`;
  if (pKey === cKey || graph.edges.has(edge)) return;
  graph.edges.add(edge);
  if (!graph.parents.has(pKey)) graph.parents.set(pKey, parent);
  const list = graph.childrenByParent.get(pKey);
  if (list) list.push(child);
  else graph.childrenByParent.set(pKey, [child]);
}

/** Resolve all deferred parent → child links against the finalized index. */
export function buildChildrenGraph(
  acc: Accumulator,
  raceResult: FlattenedRacesResult,
): ChildrenGraph {
  const graph: ChildrenGraph = {
    childrenByParent: new Map(),
    parents: new Map(),
    edges: new Set(),
  };

  for (const link of acc.pendingParentLinks) {
    const parent = acc.byPropHash.get(link.parentProp)?.get(link.parentHash);
    if (!parent) continue;
    const child = acc.byPropHash.get(link.childProp)?.get(link.childHash);
    if (!child) continue;
    addChildEdge(graph, parent, child);
  }

  // Only the merged `race` "Race (Subrace)" entries are children. 5etools'
  // own cascade (blocklist-ui.js) does the same, and the races page checks the
  // merged hash, so linking the `subrace` record too would double every rule.
  const raceMap = acc.byPropHash.get('race');
  if (raceMap) {
    for (const link of raceResult.links) {
      const parentHash = entityHash('race', link.parent);
      const childHash = entityHash('race', link.child);
      if (!parentHash || !childHash) continue;
      const parent = raceMap.get(parentHash);
      const child = raceMap.get(childHash);
      if (parent && child) addChildEdge(graph, parent, child);
    }
  }

  const groupMap = acc.byPropHash.get('itemGroup');
  const itemMap = acc.byPropHash.get('item');
  const baseitemMap = acc.byPropHash.get('baseitem');
  if (groupMap && (itemMap || baseitemMap)) {
    for (const grp of acc.pendingItemGroups) {
      const parent = groupMap.get(grp.parentHash);
      if (!parent) continue;
      for (const m of grp.members) {
        const trySources = m.fallbackSource
          ? [m.source, m.fallbackSource]
          : [m.source];
        let found: IndexedEntity | undefined;
        for (const src of trySources) {
          const h = encodeForHash(m.name, src);
          found = itemMap?.get(h) ?? baseitemMap?.get(h);
          if (found) break;
        }
        if (found) addChildEdge(graph, parent, found);
      }
    }
  }

  return graph;
}
