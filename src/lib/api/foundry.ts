/**
 * lib/api/foundry.ts — the Foundry bridge's status, the file check, and
 * opening a sheet in Foundry.
 *
 * In the desktop shell the bridge is the Rust one (src-tauri/src/foundry.rs,
 * its own port); in a browser tab it's the Node server's /api/foundry. The
 * module connects to both by default, so either sees the world.
 */
import { fetchOk, postJson, rpc } from './transport';
import {
  foundryAsk,
  foundryCommand,
  getFoundryBridgeStatus,
} from './desktop-shell';
import {
  checkFoundryFile as checkInWebview,
  neptuniumSettingsFromConfig,
  type BridgeTransport,
  type CheckResponse,
} from '$lib/services/foundry-check-service';
import type {
  BridgeClientInfo,
  BridgeResult,
  RefusedOrigin,
  ScanHit,
  ScanRule,
  ScanScope,
  WorldBlocklistRule,
} from '$lib/engine/foundry/types.ts';

export type { CheckResponse };

export interface FoundryStatus {
  connected: boolean;
  clients: BridgeClientInfo[];
  allowedOrigins: string[];
  /** Worlds the allowlist recently turned away, for the Allow button. */
  refused: RefusedOrigin[];
  /** Desktop only: where the module should connect. */
  managerUrl?: string;
  /** A failed poll, or (desktop) a bridge that couldn't start. */
  error?: string;
}

const tauriTransport: BridgeTransport = {
  listClients: async () => (await getFoundryBridgeStatus()).clients,
  ask: foundryAsk,
};

export const getFoundryStatus = (
  signal?: AbortSignal,
): Promise<FoundryStatus> =>
  rpc(
    async () => {
      const s = await getFoundryBridgeStatus();
      return { ...s, error: s.error ?? undefined };
    },
    async () => {
      const s = (await (
        await fetchOk('/api/foundry/status', { signal })
      ).json()) as FoundryStatus;
      return { ...s, refused: s.refused ?? [] };
    },
  );

export const pingFoundry = (clientId: string): Promise<void> =>
  rpc(
    async () => {
      await foundryCommand(clientId, { action: 'ping' });
    },
    async () => {
      await postJson('/api/foundry/ping', { clientId });
    },
  );

export const checkFoundry = (
  file: string,
  clientId?: string,
): Promise<CheckResponse> =>
  rpc(
    () => checkInWebview({ file, clientId }, tauriTransport),
    () => postJson('/api/foundry/check', { file, clientId }),
  );

async function runDesktopCommand(
  clientId: string,
  command: Parameters<typeof foundryCommand>[1],
  fallbackError: string,
): Promise<BridgeResult> {
  const result = await foundryCommand(clientId, command);
  if (!result.ok) throw new Error(result.error ?? fallbackError);
  return result;
}

export const openInFoundry = (
  clientId: string,
  uuid: string,
): Promise<BridgeResult> =>
  rpc(
    () =>
      runDesktopCommand(
        clientId,
        { action: 'open', uuid },
        'Foundry could not open that sheet.',
      ),
    () => postJson('/api/foundry/open', { clientId, uuid }),
  );

export const scanFoundry = (
  clientId: string,
  scope: ScanScope,
  rules: ScanRule[],
): Promise<{ hits: ScanHit[]; scanned?: { actors: number; items: number } }> =>
  rpc(
    async () => {
      const result = await runDesktopCommand(
        clientId,
        { action: 'scan', scope, rules },
        'Foundry could not scan.',
      );
      return { hits: result.hits ?? [], scanned: result.scanned };
    },
    () => postJson('/api/foundry/scan', { clientId, scope, rules }),
  );

export const replaceInFoundry = (
  clientId: string,
  uuid: string,
  rule: ScanRule,
): Promise<BridgeResult> =>
  rpc(
    () =>
      runDesktopCommand(
        clientId,
        { action: 'replace', uuid, rule },
        'Foundry could not replace that item.',
      ),
    () => postJson('/api/foundry/replace', { clientId, uuid, rule }),
  );

export const sendRulesToFoundry = (
  clientId: string,
  rules: ScanRule[],
): Promise<BridgeResult> =>
  rpc(
    () =>
      runDesktopCommand(
        clientId,
        { action: 'rules', rules },
        'Foundry could not store the rules.',
      ),
    () => postJson('/api/foundry/rules', { clientId, rules }),
  );

export const sendBlocklistToFoundry = (
  clientId: string,
  rules: WorldBlocklistRule[],
): Promise<BridgeResult> =>
  rpc(
    () =>
      runDesktopCommand(
        clientId,
        { action: 'blocklist', rules },
        'Foundry could not store the blocklist.',
      ),
    () => postJson('/api/foundry/blocklist', { clientId, rules }),
  );

export const sendNeptuniumSettings = (
  clientId: string,
): Promise<BridgeResult & { skipped?: boolean }> =>
  rpc(
    async () => {
      const settings = neptuniumSettingsFromConfig();
      if (!settings)
        return { clientId, requestId: '', ok: true, skipped: true };
      return runDesktopCommand(
        clientId,
        { action: 'neptunium', settings },
        'Foundry could not change the Neptunium settings.',
      );
    },
    () => postJson('/api/foundry/neptunium', { clientId }),
  );
