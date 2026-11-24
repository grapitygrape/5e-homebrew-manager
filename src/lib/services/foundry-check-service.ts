/**
 * lib/services/foundry-check-service.ts — "does Foundry have this homebrew
 * file's content?" and the Neptunium settings derived from active config.
 *
 * INTENT
 *   Read the file through the DataSource, build candidates (pure,
 *   engine/foundry/candidates), push them to a connected world, and fold the
 *   answer into a FoundryReport (pure, engine/foundry/report).
 *
 *   The connection itself is a `BridgeTransport`, because it lives in two
 *   places: lib/server/foundry-bridge.ts on the Node server, and the Rust
 *   bridge (src-tauri/src/foundry.rs) in the desktop shell. Both carry the
 *   same messages; only this file knows what's in them.
 *
 * ERRORS
 *   A `FoundryCheckError` carries the HTTP status the route answers with:
 *   409 nothing (or too much) connected, 404 unreadable file, 422 nothing
 *   checkable, 504 the bridge never answered, 502 the bridge reported failure.
 */
import { configProvider } from './config';
import { getDataSource } from './datasource';
import {
  buildCandidates,
  candidateCounts,
} from '$lib/engine/foundry/candidates.ts';
import {
  neptuniumSettings,
  readNeptuniumModule,
  type NeptuniumSettings,
} from '$lib/engine/foundry/neptunium-settings.ts';
import { buildReport } from '$lib/engine/foundry/report.ts';
import type {
  BridgeClientInfo,
  BridgeResult,
  FoundryQuery,
  FoundryReport,
} from '$lib/engine/foundry/types.ts';

/**
 * The Neptunium settings a connected world should have, from the active config.
 * Null when "Neptunium settings in Foundry" is off in Customize Site.
 */
export function neptuniumSettingsFromConfig(): NeptuniumSettings | null {
  const provider = configProvider();
  return neptuniumSettings(
    provider.effectiveAppSettings(),
    readNeptuniumModule(provider.stored()),
  );
}

export interface BridgeTransport {
  listClients(): Promise<BridgeClientInfo[]>;
  /** Rejects when the client is gone, disconnects mid-flight, or times out. */
  ask(
    clientId: string,
    query: Omit<FoundryQuery, 'requestId'>,
  ): Promise<BridgeResult>;
}

export interface CheckRequest {
  file?: string;
  clientId?: string;
  fuzzy?: boolean;
  fuzzyThreshold?: number;
  maxMatches?: number;
}

export type CheckResponse = FoundryReport & {
  counts: Record<string, number>;
  client: BridgeClientInfo;
};

export class FoundryCheckError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Which connected world to ask, or why we can't. With exactly one connected
 * the caller needn't say; with several, an ambiguous request is refused, not
 * guessed.
 */
function pickClient(
  all: BridgeClientInfo[],
  clientId?: string,
): BridgeClientInfo {
  if (clientId) {
    const client = all.find((c) => c.clientId === clientId);
    if (!client)
      throw new FoundryCheckError(
        409,
        'That Foundry world is no longer connected.',
      );
    return client;
  }
  if (all.length === 1) return all[0];
  if (all.length === 0) {
    throw new FoundryCheckError(
      409,
      'No Foundry world is connected. Open a world with the Homebrew Manager Bridge module enabled, ' +
        'and make sure its URL is listed under Settings → Foundry URL.',
    );
  }
  throw new FoundryCheckError(
    409,
    `${all.length} Foundry worlds are connected (${all.map((c) => c.world).join(', ')}). ` +
      'Pass a clientId to say which one to check.',
  );
}

export async function checkFoundryFile(
  req: CheckRequest,
  transport: BridgeTransport,
): Promise<CheckResponse> {
  const file = req.file?.trim();
  if (!file) throw new FoundryCheckError(400, 'Missing "file".');

  const client = pickClient(await transport.listClients(), req.clientId);

  let doc: Record<string, unknown>;
  try {
    doc = await getDataSource().readHomebrew(file);
  } catch (e) {
    throw new FoundryCheckError(404, (e as Error).message);
  }

  const candidates = buildCandidates(doc);
  if (candidates.length === 0) {
    throw new FoundryCheckError(
      422,
      'Nothing in this file can be checked against Foundry — it has no items, spells, feats, or features.',
    );
  }

  let result: BridgeResult;
  try {
    result = await transport.ask(client.clientId, {
      candidates,
      options: {
        fuzzy: req.fuzzy !== false,
        fuzzyThreshold: Number(req.fuzzyThreshold ?? 0.72),
        maxMatches: Math.max(1, Number(req.maxMatches ?? 8)),
      },
    });
  } catch (e) {
    // Disconnect or timeout: "the far side never answered", distinct from a
    // 409 "nothing is connected".
    throw new FoundryCheckError(504, (e as Error).message);
  }

  if (!result.ok)
    throw new FoundryCheckError(
      502,
      result.error ?? 'The Foundry bridge reported a failure.',
    );

  const report = buildReport({
    file,
    world: client.world,
    system: client.system,
    candidates,
    results: result.results ?? [],
    elapsedMs: result.elapsedMs,
    searched: result.searched,
  });

  return { ...report, counts: candidateCounts(candidates), client };
}
