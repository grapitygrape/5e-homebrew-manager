/**
 * engine/foundry/blocklist-push.ts — sending content-blocklist.json to
 * Neptunium's World Content Blocklist in each connected world. Pure.
 *
 * WHY
 *   Neptunium filters with a world setting and never reads the deployed file
 *   (see foundry-homebrew-bridge/scripts/lib/blocklist.js), so Deploy pushes the
 *   rules to every connected world as well as copying the file.
 */
import type { BlocklistEntry } from '$lib/engine/blocklist';
import {
  BRIDGE_FEATURES,
  type BridgeClientInfo,
  type WorldBlocklistRule,
} from './types.ts';

/** The rules as Neptunium stores them; fields it doesn't know stay behind. */
export function toWorldRules(entries: BlocklistEntry[]): WorldBlocklistRule[] {
  return entries.map(({ displayName, hash, category, source, isAuto }) => ({
    displayName,
    hash,
    category,
    source,
    isAuto,
  }));
}

/** Worlds whose module can take the blocklist, and those too old to. */
export function blocklistWorlds(clients: BridgeClientInfo[]): {
  ready: BridgeClientInfo[];
  outdated: BridgeClientInfo[];
} {
  const can = (c: BridgeClientInfo) =>
    (c.features ?? []).includes(BRIDGE_FEATURES.blocklist);
  return {
    ready: clients.filter(can),
    outdated: clients.filter((c) => !can(c)),
  };
}

/** What happened in one world. */
export type WorldPushOutcome =
  | { world: string; ok: true; count: number; changed: boolean }
  | { world: string; ok: false; error: string };

/**
 * One sentence per kind of result, for the Deploy banner. Empty when no world
 * was connected, so a plain file deploy reads the same as before.
 */
export function describeWorldPush(
  outcomes: WorldPushOutcome[],
  outdated: BridgeClientInfo[],
): { text: string; failed: boolean } {
  const parts: string[] = [];
  const updated = outcomes.filter((o) => o.ok && o.changed);
  const same = outcomes.filter((o) => o.ok && !o.changed);
  const failed = outcomes.filter(
    (o): o is Extract<WorldPushOutcome, { ok: false }> => !o.ok,
  );
  const names = (list: { world: string }[]) =>
    list.map((o) => o.world).join(', ');

  if (updated.length)
    parts.push(`Updated Neptunium's World Content Blocklist in ${names(updated)}.`);
  if (same.length)
    parts.push(`${names(same)} already had this blocklist.`);
  for (const o of failed)
    parts.push(`${o.world}: ${o.error}`);
  if (outdated.length)
    parts.push(
      `${names(outdated)} ${outdated.length === 1 ? 'runs' : 'run'} a bridge module too old to take the blocklist - update it.`,
    );
  return {
    text: parts.join(' '),
    failed: failed.length > 0 || outdated.length > 0,
  };
}
