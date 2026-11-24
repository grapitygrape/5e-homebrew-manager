/**
 * engine/foundry/types.ts — the wire contract between the manager and the
 * `foundry-homebrew-bridge` Foundry module.
 *
 * INTENT
 *   A Foundry module is client-side ESM: it runs in the browser, not in
 *   Foundry's Node server, and Foundry exposes no HTTP API for pack contents
 *   (v11+ packs are server-side LevelDB behind an authenticated socket). So the
 *   manager cannot call Foundry — the bridge calls *out* to the manager and
 *   holds an SSE stream open. These types are the only thing both sides share.
 *
 *   Keep this file dependency-free and framework-free. The Foundry module
 *   (foundry-homebrew-bridge/scripts/bridge.js and search.js) builds these shapes
 *   by hand, so if you change a field here, change it there.
 *
 * PROTOCOL
 *   1. bridge  → GET  /api/foundry/stream?…      (SSE; stays open)
 *      manager → event: hello  { clientId }
 *      manager → event: ping   {}                (keepalive, every 25s)
 *   2. UI      → POST /api/foundry/check         { file, clientId? }
 *      manager → event: query  FoundryQuery      (pushed down the stream)
 *   3. bridge  → POST /api/foundry/result        BridgeResult
 *      manager → resolves the pending check, returns FoundryReport to the UI
 *   4. UI      → POST /api/foundry/open          { clientId, uuid }
 *      manager → event: command FoundryCommand   (same stream, same result POST)
 *   5. UI      → POST /api/foundry/scan          { clientId, scope, rules }
 *      bridge  → BridgeResult { hits }           (a command, with a longer timeout)
 *   6. UI      → POST /api/foundry/replace       { clientId, uuid, rule }
 *   7. UI      → POST /api/foundry/rules         { clientId, rules }
 *      sent on its own for every newly connected world (state/foundry.svelte.ts)
 *   8. bridge  → POST /api/foundry/state         { clientId, state }
 *      after hello and whenever the world's enforcement settings change
 *   9. site browser → sendTargets / send commands (src-tauri/src/site_browser.rs)
 *      desktop app only; these never come over HTTP
 *  10. UI      → POST /api/foundry/blocklist     { clientId, rules }
 *      sent by the Blocklist page's Deploy, to every world that can take it
 *  11. UI      → POST /api/foundry/neptunium     { clientId }
 *      the server works out the settings from its config; sent once per newly
 *      connected world (state/foundry.svelte.ts)
 *
 *   A refused stream gets a readable 403 (CORS headers included), so the
 *   module can tell "not allowed" from "not running".
 */

import type { NeptuniumSettings } from './neptunium-settings.ts';

/** What a module can do beyond `query`, sent in the handshake as `features`. */
export const BRIDGE_FEATURES = {
  open: 'open',
  scan: 'scan',
  replace: 'replace',
  /** Stores the mappings and reports its enforcement state (module 1.3.0). */
  rules: 'rules',
  /** Takes sends from the site browser (module 1.4.0). */
  send: 'send',
  /** Sets Neptunium's World Content Blocklist from content-blocklist.json. */
  blocklist: 'blocklist',
  /** Sets Neptunium's data source settings (deploy-modules/foundry-neptunium). */
  neptunium: 'neptunium',
} as const;

/** Which Foundry document collection a homebrew type maps onto. */
export type FoundryDocClass = 'Item' | 'Actor';

/** One homebrew entity we want to look for in Foundry. */
export interface Candidate {
  /** Stable within a request: `${type}:${index}`. */
  id: string;
  /** 5etools array key — item, spell, feat, subclassFeature, … */
  type: string;
  name: string;
  /** Homebrew source abbreviation (from the entity, else `_meta.sources[0].json`). */
  source: string;
  /**
   * Every name for `source` the file declares: the json id, its abbreviation
   * and full title from `_meta.sources`. Compared with a match's `sourceIds`.
   */
  sourceNames: string[];
  docClass: FoundryDocClass;
  /**
   * Preferred Foundry subtype(s), e.g. `['spell']`. A match of another subtype
   * is still reported, flagged `typeMatch: false` — that's usually a real bug
   * (a spell imported as a feat), not noise.
   */
  expect: string[];
}

/** How a Foundry document was tied to a candidate. */
export type MatchKind = 'exact' | 'normalized' | 'fuzzy';

/** One Foundry document that matched, plus the three completeness checks. */
export interface FoundryMatch {
  uuid: string;
  name: string;
  /** Foundry subtype: 'weapon', 'spell', 'feat', 'npc', … */
  docType: string;
  /** Pack collection id (`my-items.gear`) or the literal `world`. */
  pack: string;
  packLabel: string;
  matchKind: MatchKind;
  /** 0–1. Exactly 1 for `exact`. */
  score: number;
  /** Is `docType` in the candidate's `expect` list? (true when `expect` is empty) */
  typeMatch: boolean;

  // --- the three checks -----------------------------------------------------
  img: string;
  /** img set and not a Foundry placeholder (`icons/svg/…`). */
  hasImage: boolean;
  /** Description survives HTML-stripping with non-whitespace left. */
  hasDescription: boolean;
  descriptionChars: number;
  /** dnd5e `system.activities` entry count. 0 for systems without activities. */
  activityCount: number;
  /** Activity `type`s present, e.g. ['attack','damage']. */
  activityTypes: string[];

  /** dnd5e `system.source.book`/`.custom`, when the system records one. */
  source: string;
  /**
   * Every source id on the document: Neptunium's `flags.plutonium.source`,
   * `system.source.book` and `.custom`. Absent from modules before 1.1.0.
   */
  sourceIds?: string[];
  /**
   * Does the document's source agree with the homebrew's? Set by the report,
   * not the bridge. null when either side records no source.
   */
  sourceMatch?: boolean | null;
}

/** The bridge's answer for one candidate. */
export interface CandidateResult {
  id: string;
  matches: FoundryMatch[];
}

/** What the manager pushes down the SSE stream. */
export interface FoundryQuery {
  requestId: string;
  candidates: Candidate[];
  options: {
    fuzzy: boolean;
    /** 0–1. A fuzzy match below this score is discarded. */
    fuzzyThreshold: number;
    /** Cap on matches returned per candidate. */
    maxMatches: number;
  };
}

/** An action pushed down the stream, answered with a BridgeResult. */
export type FoundryCommand =
  | PingCommand
  | OpenCommand
  | ScanCommand
  | ReplaceCommand
  | RulesCommand
  | SendTargetsCommand
  | SendCommand
  | BlocklistCommand
  | NeptuniumCommand;

/** A command as the caller writes it; the transport adds `requestId`. */
export type FoundryCommandInput = FoundryCommand extends infer C
  ? C extends FoundryCommand
    ? Omit<C, 'requestId'>
    : never
  : never;

/**
 * Is the world still answering? Any reply counts, so a module too old to know
 * `ping` (it answers "Unknown command") is still alive.
 */
export interface PingCommand {
  requestId: string;
  action: 'ping';
}

export interface OpenCommand {
  requestId: string;
  /** Open the document's sheet in the GM's Foundry tab. */
  action: 'open';
  uuid: string;
}

/** Look through the world's actors and items for superseded content. */
export interface ScanCommand {
  requestId: string;
  action: 'scan';
  scope: ScanScope;
  rules: ScanRule[];
}

/** Swap one actor's item for its replacement, and carry its slot over. */
export interface ReplaceCommand {
  requestId: string;
  action: 'replace';
  uuid: string;
  rule: ScanRule;
}

/** Store the mappings in the world, so every client can enforce them on import. */
export interface RulesCommand {
  requestId: string;
  action: 'rules';
  rules: ScanRule[];
}

/** One rule as Neptunium stores it: 5etools' blocklist row. */
export interface WorldBlocklistRule {
  displayName: string;
  hash: string;
  category: string;
  source: string;
  isAuto: boolean;
}

/**
 * Replace Neptunium's World Content Blocklist with these rules. The module
 * keeps Neptunium's own auto-managed rows and answers `{ count, changed }`.
 */
export interface BlocklistCommand {
  requestId: string;
  action: 'blocklist';
  rules: WorldBlocklistRule[];
}

/**
 * Set Neptunium's config values, `{ group: { key: value } }`. The module
 * writes only keys it knows, asks the GM to reload, and answers `{ updated }`.
 */
export interface NeptuniumCommand {
  requestId: string;
  action: 'neptunium';
  settings: NeptuniumSettings;
}

/** A Rivet packet as the site fires it: `rivet.send`'s event detail. */
export interface RivetPacket {
  type: string;
  data?: unknown;
}

/** Which actors could take these packets. `packets` carry only what the rules read. */
export interface SendTargetsCommand {
  requestId: string;
  action: 'sendTargets';
  packets: { type: string; page?: string }[];
}

/** Import packets onto an actor, or send them on as Rivet would when `targetUuid` is null. */
export interface SendCommand {
  requestId: string;
  action: 'send';
  targetUuid: string | null;
  packets: RivetPacket[];
}

/** One entry in the site browser's picker. */
export interface SendTarget {
  uuid: string;
  name: string;
  kind: 'character' | 'party' | 'group' | 'encounter';
  /** The actor's folder; empty at the top level. Tells apart repeated names. */
  folder: string;
  /** Can't hold everything being sent. */
  blocked: boolean;
}

export interface ScanScope {
  characters: boolean;
  npcs: boolean;
  items: boolean;
}

/** One original and what replaces it. Names are display text, not hashes. */
export interface ScanRule {
  /** Stable within a request; the hits point back at it. */
  id: string;
  originalName: string;
  originalSource: string;
  /** The primary target's name and source. */
  replacementName: string;
  replacementSource: string;
}

/** Where a scanned document was found. */
export type ScanLocation =
  | { kind: 'world' }
  | {
      kind: 'actor';
      actorUuid: string;
      actorName: string;
      /** 'character' | 'npc' */
      actorType: string;
    };

export interface ScanHit {
  uuid: string;
  name: string;
  /** Foundry subtype: 'spell', 'weapon', 'feat', … */
  docType: string;
  ruleId: string;
  /** `original` is still the superseded content; `replaced` is a stand-in already swapped in. */
  state: 'original' | 'replaced';
  location: ScanLocation;
}

/** What the bridge POSTs back. */
export interface BridgeResult {
  clientId: string;
  requestId: string;
  ok: boolean;
  results?: CandidateResult[];
  error?: string;
  /** How long the bridge spent searching, ms. */
  elapsedMs?: number;
  /** Packs actually searched, for the report footer. */
  searched?: { packs: number; documents: number };
  hits?: ScanHit[];
  /** What a scan walked. */
  scanned?: { actors: number; items: number };
  /** A replace: the new item's name, and the favorites and pins rewritten. */
  name?: string;
  references?: number;
  /** Activity favorites or pins with no counterpart on the new item. */
  dropped?: number;
  /** A rules or blocklist push: how many rules the world now holds. */
  count?: number;
  /** A blocklist push: false when the world already held that list. */
  changed?: boolean;
  /** A Neptunium settings push: the keys that changed (empty when none). */
  updated?: string[];
  /** A sendTargets: who could take the packets. */
  targets?: SendTarget[];
  /** A send: how much landed, and what didn't. */
  sent?: number;
  failed?: { name: string; error: string }[];
}

/**
 * What a world enforces, as its module reports it. The switches are module
 * settings in Foundry; the manager only shows them.
 */
export interface EnforcementState {
  /** Swap superseded items for their replacements on import. */
  imports: boolean;
  /** Show players a banner on a replaced item's sheet. */
  banner: boolean;
  /** How many mappings the world holds. */
  rules: number;
}

/** A connected bridge, as advertised to the UI. */
export interface BridgeClientInfo {
  clientId: string;
  world: string;
  worldId: string;
  system: string;
  systemVersion: string;
  foundryVersion: string;
  user: string;
  /** Epoch ms. */
  connectedAt: number;
  origin: string;
  /** The module's version; empty from modules older than 1.1.0. */
  moduleVersion: string;
  /** BRIDGE_FEATURES values the module handles. */
  features: string[];
  /** Absent until the module reports it, and from modules before 1.3.0. */
  enforcement?: EnforcementState;
}

/** A Foundry origin the bridge turned away because it isn't allowlisted. */
export interface RefusedOrigin {
  origin: string;
  /** From the handshake; display-only and spoofable. */
  world: string;
  /** Epoch ms of the latest attempt. */
  at: number;
}

// --- report ------------------------------------------------------------------

/** Which of the three checks came up empty on the best match. */
export type Gap = 'image' | 'description' | 'activities';

export type RowStatus =
  /** Found, and all three checks pass. */
  | 'ok'
  /** Found, but at least one check is empty. */
  | 'incomplete'
  /** Found only by fuzzy match, or several equally-good matches — eyeball it. */
  | 'ambiguous'
  /** Nothing in any pack or the world. */
  | 'missing';

export interface ReportRow {
  candidate: Candidate;
  status: RowStatus;
  /** Highest-scoring match, preferring one whose subtype matches `expect`. */
  best: FoundryMatch | null;
  /** All matches, best first. */
  matches: FoundryMatch[];
  gaps: Gap[];
  /** Why the row is `ambiguous`, when it is. */
  note?: string;
}

export interface ReportSummary {
  total: number;
  ok: number;
  incomplete: number;
  ambiguous: number;
  missing: number;
  /** Rows failing each individual check (best match only). */
  noImage: number;
  noDescription: number;
  noActivities: number;
}

export interface FoundryReport {
  file: string;
  world: string;
  system: string;
  generatedAt: number;
  elapsedMs: number;
  searched: { packs: number; documents: number };
  summary: ReportSummary;
  rows: ReportRow[];
}
