/**
 * engine/foundry/neptunium-settings.ts — the Neptunium data source settings a
 * connected world should have, worked out from the manager's own config. Pure.
 *
 * WHAT IT SETS
 *   Neptunium keeps these in its `dataSources` config group (the world setting
 *   `plutonium.config`). Only settings the manager knows the answer to:
 *   - Local homebrew: on, read through index.json, from the Foundry homebrew
 *     deploy folder's path under Foundry's Data folder.
 *   - The site and media URLs: the Tools URL.
 *   - The World Content Blocklist switches: the Customize Site toggles.
 *   Data source filtering, permissions and prerelease stay the GM's choice.
 *
 * The "Neptunium settings in Foundry" module (deploy-modules/foundry-neptunium)
 * turns this on and off; it changes nothing on the site.
 */
import type { AppSettings, StoredConfig } from '$lib/data';

export const NEPTUNIUM_MODULE_ID = 'foundry-neptunium';

/** The module's state; defaults match its module.json. */
export interface NeptuniumModuleState {
  enabled: boolean;
  blocklistPlayers: boolean;
  blocklistGms: boolean;
}

/** Neptunium `dataSources` keys this can set. */
export interface NeptuniumDataSources {
  isPlayerUseBlocklist?: boolean;
  isGmUseBlocklist?: boolean;
  isLoadLocalHomebrewIndex?: boolean;
  localHomebrewDirectoryPath?: string;
  isUseLocalHomebrewIndexJson?: boolean;
  baseSiteUrl?: string;
  baseMediaUrlImg?: string;
  baseMediaUrlAudio?: string;
  baseMediaUrlFonts?: string;
}

/** What the module asks for, by Neptunium config group. */
export interface NeptuniumSettings {
  dataSources: NeptuniumDataSources;
}

const bool = (v: unknown, fallback: boolean) =>
  typeof v === 'boolean' ? v : fallback;

/** The module's switch and toggles from hbm-config.json's `deploy.modules`. */
export function readNeptuniumModule(stored: StoredConfig): NeptuniumModuleState {
  const deploy = stored.deploy as
    | { modules?: Record<string, { enabled?: unknown; options?: Record<string, unknown> }> }
    | undefined;
  const mine = deploy?.modules?.[NEPTUNIUM_MODULE_ID];
  return {
    enabled: bool(mine?.enabled, true),
    blocklistPlayers: bool(mine?.options?.['blocklist-players'], true),
    blocklistGms: bool(mine?.options?.['blocklist-gms'], true),
  };
}

/**
 * A folder's path under Foundry's Data folder, e.g.
 * `\\SERVER\Games\Foundry\Data\assets\homebrew` → `assets/homebrew`. Null
 * when the path has no `Data` folder with something below it, which is how a
 * site's homebrew/ folder is told apart from Foundry's.
 */
export function foundryDataRelative(folder: string): string | null {
  const parts = folder.trim().split(/[\\/]+/).filter(Boolean);
  const at = parts.findLastIndex((p) => p.toLowerCase() === 'data');
  if (at < 0 || at === parts.length - 1) return null;
  return parts.slice(at + 1).join('/');
}

/** The settings to push, or null when the module is off. */
export function neptuniumSettings(
  app: Pick<AppSettings, 'toolsUrl' | 'homebrewDeployFolders'>,
  mod: NeptuniumModuleState,
): NeptuniumSettings | null {
  if (!mod.enabled) return null;
  const dataSources: NeptuniumDataSources = {
    isPlayerUseBlocklist: mod.blocklistPlayers,
    isGmUseBlocklist: mod.blocklistGms,
  };

  const dir = app.homebrewDeployFolders
    .map(foundryDataRelative)
    .find((d): d is string => d !== null);
  if (dir) {
    dataSources.isLoadLocalHomebrewIndex = true;
    dataSources.localHomebrewDirectoryPath = dir;
    dataSources.isUseLocalHomebrewIndexJson = true;
  }

  const base = app.toolsUrl.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(base)) {
    dataSources.baseSiteUrl = `${base}/`;
    dataSources.baseMediaUrlImg = `${base}/img/`;
    dataSources.baseMediaUrlAudio = `${base}/audio/`;
    dataSources.baseMediaUrlFonts = `${base}/fonts/`;
  }
  return { dataSources };
}
