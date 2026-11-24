import { getJson, postJson, putJson, rpc } from './transport';
import {
  allowFoundryOrigin as allowInWebview,
  saveSettings as saveInWebview,
  settingsView,
  type SettingsFields,
  type SettingsStatus,
  type SettingsView,
} from '$lib/services/settings-service';
import {
  bridgeDeployStatus,
  deployBridge,
  syncBridge,
  type BridgeDeployResult,
  type BridgeDeployStatus,
} from '$lib/services/bridge-deploy';

export type {
  BridgeDeployResult,
  BridgeDeployStatus,
  SettingsFields,
  SettingsStatus,
  SettingsView,
};

export const getSettings = (): Promise<SettingsView> =>
  rpc(settingsView, () => getJson<SettingsView>('/api/settings'));

export const saveSettings = (
  fields: SettingsFields,
): Promise<{ status: SettingsStatus }> =>
  rpc(
    () => saveInWebview(fields),
    () => putJson('/api/settings', fields),
  );

export const allowFoundryOrigin = (origin: string): Promise<string[]> =>
  rpc(
    () => allowInWebview(origin),
    async () =>
      (
        await postJson<{ foundryUrls: string[] }>(
          '/api/settings/foundry-origins',
          { origin },
        )
      ).foundryUrls,
  );

export const getBridgeDeployStatus = (): Promise<BridgeDeployStatus> =>
  rpc(bridgeDeployStatus, () =>
    getJson<BridgeDeployStatus>('/api/bridge-deploy'),
  );

export const deployBridgeModule = (): Promise<BridgeDeployResult> =>
  rpc(deployBridge, () => postJson('/api/bridge-deploy', {}));

export const syncBridgeModule = (): Promise<BridgeDeployResult | null> =>
  rpc(syncBridge, () => postJson('/api/bridge-deploy', { sync: true }));
