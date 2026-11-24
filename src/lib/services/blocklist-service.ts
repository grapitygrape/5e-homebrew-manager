/**
 * lib/services/blocklist-service.ts — the `content-blocklist.json` document:
 * read it, diagnose/repair its rules, write it back.
 *
 * The rules are checked against the content index (content-index-service.ts),
 * which this module reads but doesn't build.
 */
import { getDataSource } from './datasource';
import { configProvider } from './config';
import { configuredDeployTargets } from './homebrew-deploy';
import { getContentIndex, isIndexReady } from './content-index-service';
import { describeRef } from '$lib/data';
import {
  propLabel,
  parseBlocklistDocument,
  serializeBlocklistDocument,
  emptyEnvelope,
  diagnoseBlocklist,
} from '$lib/engine/blocklist';
import type {
  BlocklistEntry,
  BlocklistDocument,
  EntryDiagnosis,
} from '$lib/engine/blocklist';

export interface LoadedBlocklist {
  entries: BlocklistEntry[];
  envelope: Record<string, unknown>;
  diagnoses: EntryDiagnosis[];
  counts: Record<string, number>;
  repairedCount: number;
  /** Exact-duplicate rules collapsed on read (identical on disk). */
  duplicatesRemoved: number;
  /** Rules dropped because a repair made them identical to another rule. */
  collapsed: string[];
  /** False when no `content-blocklist.json` exists yet. */
  exists: boolean;
}

/**
 * Read `content-blocklist.json` and run the diagnose/repair pass over it. The
 * returned `entries` already have repairs applied — the UI shows the diagnoses
 * so the user can see what changed before they commit it with Save.
 */
export async function loadBlocklist(): Promise<LoadedBlocklist> {
  const ds = getDataSource();
  const raw = await ds.readBlocklistFile();
  if (!raw) {
    return {
      entries: [],
      envelope: emptyEnvelope(),
      diagnoses: [],
      counts: {},
      repairedCount: 0,
      duplicatesRemoved: 0,
      collapsed: [],
      exists: false,
    };
  }
  return review(parseBlocklistDocument(raw));
}

/** Run the diagnose/repair pass over a parsed document. */
async function review(doc: BlocklistDocument): Promise<LoadedBlocklist> {
  const index = await getContentIndex();
  const report = diagnoseBlocklist(doc.entries, index);
  return {
    entries: report.entries,
    envelope: doc.envelope,
    diagnoses: report.diagnoses,
    counts: report.counts,
    repairedCount: report.repairedCount,
    duplicatesRemoved: doc.duplicatesRemoved,
    collapsed: report.collapsed,
    exists: true,
  };
}

/** Diagnose an arbitrary blocklist payload (an import) without touching disk. */
export const diagnoseImport = (raw: unknown): Promise<LoadedBlocklist> =>
  review(parseBlocklistDocument(raw));

/** Write the blocklist back, rotating the previous file to `.bak`. */
export async function saveBlocklist(
  entries: BlocklistEntry[],
  envelope: Record<string, unknown>,
): Promise<{ count: number }> {
  const ds = getDataSource();
  const json = serializeBlocklistDocument({ entries, envelope });
  const meta = json._meta as Record<string, unknown> | undefined;
  if (meta && typeof meta === 'object')
    meta.dateLastModified = Math.floor(Date.now() / 1000);
  await ds.writeBlocklistFile(json, { backup: true });
  return { count: entries.length };
}

export interface BlocklistViewInfo {
  homebrewPath: string;
  dataPath: string;
  /** A URL-based homebrew source can't be written to. */
  canSave: boolean;
  /** Whether Settings names anywhere to copy the saved file to. */
  canDeploy: boolean;
  indexWarm: boolean;
}

/** What the Blocklist view needs before the (slow) index loads. */
export function blocklistViewInfo(): BlocklistViewInfo {
  const cfg = configProvider().effectiveConfig();
  return {
    homebrewPath: describeRef(cfg.homebrew),
    dataPath: describeRef(cfg.data),
    canSave: !cfg.homebrew.url,
    canDeploy: configuredDeployTargets().length > 0,
    indexWarm: isIndexReady(),
  };
}

export { propLabel };
