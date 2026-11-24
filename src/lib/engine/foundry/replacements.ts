/**
 * engine/foundry/replacements.ts — mapping rows into scan rules, and scan hits
 * into table rows.
 *
 * Pure. The Foundry module does the matching (foundry-homebrew-bridge/scripts/lib/
 * replacements.js); this side only says what to look for and lays out what
 * came back.
 */
import type { SupersessionRow } from '$lib/engine/supersession';
import { BRIDGE_FEATURES } from './types.ts';
import type {
  BridgeClientInfo,
  ScanHit,
  ScanLocation,
  ScanRule,
} from './types.ts';

/** `"Brilliance|SDS"` → name and source. A uid with no source keeps it empty. */
export function splitUid(uid: string): { name: string; source: string } {
  const at = uid.lastIndexOf('|');
  if (at < 0) return { name: uid, source: '' };
  return { name: uid.slice(0, at), source: uid.slice(at + 1) };
}

/** One rule per row, using its primary target. Rows with no target are skipped. */
export function buildScanRules(rows: SupersessionRow[]): ScanRule[] {
  const rules: ScanRule[] = [];
  rows.forEach((row, i) => {
    const target = row.replacedBy[0];
    if (!target || !row.displayName) return;
    const to = splitUid(target.uid);
    rules.push({
      id: String(i),
      originalName: row.displayName,
      originalSource: row.source,
      replacementName: to.name,
      replacementSource: to.source,
    });
  });
  return rules;
}

/** Connected worlds that take rules and haven't been sent the saved list yet. */
export function worldsNeedingRules(
  clients: BridgeClientInfo[],
  sent: ReadonlySet<string>,
): BridgeClientInfo[] {
  return clients.filter(
    (c) =>
      (c.features ?? []).includes(BRIDGE_FEATURES.rules) &&
      !sent.has(c.clientId),
  );
}

/**
 * The rules a world should hold: the saved mappings. With no saved file there
 * is nothing to say, so the world keeps what it has rather than being cleared
 * by a manager that isn't set up.
 */
export function rulesToSync(saved: {
  rows: SupersessionRow[];
  fileExists: boolean;
}): ScanRule[] | null {
  return saved.fileExists ? buildScanRules(saved.rows) : null;
}

/**
 * One line for what a world reports it enforces. The switches are module
 * settings in Foundry, so a world that is off says where to turn it on.
 */
export function enforcementStatus(client: BridgeClientInfo): {
  variant: 'ok' | 'warning' | 'default';
  text: string;
} {
  const name = client.world;
  if (!(client.features ?? []).includes(BRIDGE_FEATURES.rules))
    return {
      variant: 'warning',
      text: `The bridge module in ${name} is too old to swap on import. Deploy it from Settings, then reload the world.`,
    };
  const state = client.enforcement;
  if (!state)
    return { variant: 'default', text: `Waiting for ${name} to report its settings.` };
  if (!state.imports)
    return {
      variant: 'warning',
      text: `${name} isn't swapping on import. Turn it on in Foundry: Configure Settings, Homebrew Manager Bridge.`,
    };
  if (!state.rules)
    return { variant: 'warning', text: `${name} holds no mappings to swap yet.` };
  const count = `${state.rules} ${state.rules === 1 ? 'mapping' : 'mappings'}`;
  const banner = state.banner ? '' : ' Player banner off.';
  return { variant: 'ok', text: `${name} swaps ${count} on import.${banner}` };
}

export interface ScanRow {
  hit: ScanHit;
  /** "Daylight XPHB" */
  replaced: string;
  /** "Brilliance SDS" */
  replacedWith: string;
  /** Where it was found, for the second line under the name. */
  where: string;
}

const withSource = (name: string, source: string) =>
  source ? `${name} ${source}` : name;

export function describeLocation(loc: ScanLocation): string {
  if (loc.kind === 'world') return 'World item';
  const kind = loc.actorType === 'npc' ? 'NPC' : 'Character';
  return `${kind}, ${loc.actorName}`;
}

/**
 * Hits joined to their rules, in a stable order: type, then name, then place.
 * A stand-in already swapped in needs nothing done, so it is left out; the
 * caller counts those from the hits.
 */
export function buildScanRows(hits: ScanHit[], rules: ScanRule[]): ScanRow[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const rows: ScanRow[] = [];
  for (const hit of hits) {
    const rule = byId.get(hit.ruleId);
    if (!rule || hit.state === 'replaced') continue;
    rows.push({
      hit,
      replaced: withSource(rule.originalName, rule.originalSource),
      replacedWith: withSource(rule.replacementName, rule.replacementSource),
      where: describeLocation(hit.location),
    });
  }
  return rows.sort(
    (a, b) =>
      a.hit.docType.localeCompare(b.hit.docType) ||
      a.hit.name.localeCompare(b.hit.name) ||
      a.where.localeCompare(b.where),
  );
}
