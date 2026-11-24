/**
 * lib/services/bridge-deploy.ts — install the foundry-homebrew-bridge Foundry
 * module from its repo into Foundry's Data/modules folder.
 *
 * INTENT
 *   The module ships inside this repo (`foundry-homebrew-bridge/`) and is bundled
 *   with the desktop app, so the only path Settings needs is Foundry's data
 *   folder (Deployment). With that set, the module can be copied in without
 *   anyone finding Foundry's modules folder by hand. Status compares file
 *   contents, not versions, because the module is usually edited without a
 *   version bump.
 *
 * FORGIVING PATHS
 *   The source folder may be the module itself or a checkout that holds it in
 *   a `foundry-homebrew-bridge/` subfolder. The data path may be Foundry's user
 *   data folder, its Data folder, or Data/modules.
 *
 * LINKED INSTALLS
 *   A module symlinked or junctioned into Foundry is already live, and copying
 *   a file onto itself can truncate it. So a target that is a link is reported
 *   as `linked` and never written to, wherever it points. A link to another
 *   copy is usually the working checkout, and copying the bundled snapshot
 *   through it would roll that checkout back.
 */
import { fs, path } from '$lib/fs';
import { configProvider } from './config';
import { resolveLocalDir } from './homebrew-deploy';

export const BRIDGE_MODULE_ID = 'foundry-homebrew-bridge';

/** Folders that are never part of the module: VCS, editor and package clutter. */
const SKIP_DIRS = new Set(['node_modules']);

export type BridgeDeployState =
  /** The repo folder or the Foundry data folder isn't set. */
  | 'unset'
  /** No module.json for foundry-homebrew-bridge in the repo folder. */
  | 'no-source'
  /** No modules/ folder under the Foundry data path. */
  | 'no-foundry'
  /** Not installed yet. */
  | 'missing'
  /** Installed, but some files differ from the repo. */
  | 'outdated'
  /** Installed and identical. */
  | 'current'
  /** The installed folder is a link to the repo, so it's always current. */
  | 'linked';

export interface BridgeDeployStatus {
  state: BridgeDeployState;
  /** The folder holding the module's module.json. */
  sourceDir: string | null;
  /** `<Data>/modules/foundry-homebrew-bridge`. */
  target: string | null;
  sourceVersion: string | null;
  installedVersion: string | null;
  /** Relative paths that are new or differ, when `outdated`. */
  changed: string[];
  /** One sentence for the Settings view. */
  message: string;
}

export interface BridgeDeployResult {
  target: string;
  copied: number;
  version: string | null;
}

// Where the bundled module sits. The desktop shell and the Node server each
// set it at startup, since only they know where the app lives.
let bundledDir = '';

export function setBundledBridgeDir(dir: string | null | undefined): void {
  bundledDir = dir?.trim() ?? '';
}

/** The bundled module folder and the saved Foundry data folder. */
export function bridgePaths(): { repo: string; data: string } {
  return {
    repo: bundledDir,
    data: configProvider().effectiveAppSettings().foundryDataPath.trim(),
  };
}

async function readModuleJson(
  dir: string,
): Promise<{ id?: string; version?: string } | null> {
  try {
    return JSON.parse(await fs().readText(path.join(dir, 'module.json')));
  } catch {
    return null;
  }
}

/** The folder holding the bridge's module.json: `repo` itself, or its subfolder. */
export async function findModuleDir(repo: string): Promise<string | null> {
  for (const dir of [repo, path.join(repo, BRIDGE_MODULE_ID)]) {
    if ((await readModuleJson(dir))?.id === BRIDGE_MODULE_ID) return dir;
  }
  return null;
}

async function isDir(dir: string): Promise<boolean> {
  try {
    return (await fs().stat(dir)).isDirectory;
  } catch {
    return false;
  }
}

/** Foundry's modules/ folder, from a user data, Data, or modules path. */
export async function findModulesDir(data: string): Promise<string | null> {
  const candidates =
    path.basename(data).toLowerCase() === 'modules'
      ? [data]
      : [path.join(data, 'modules'), path.join(data, 'Data', 'modules')];
  for (const dir of candidates) if (await isDir(dir)) return dir;
  return null;
}

/** Every file in the module, as forward-slash paths relative to `dir`. */
export async function moduleFiles(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs().readDir(rel ? path.join(dir, rel) : dir)) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory) out.push(...(await moduleFiles(dir, child)));
    else if (entry.isFile) out.push(child);
  }
  return out.sort();
}

const samePath = async (a: string, b: string): Promise<boolean> => {
  try {
    const [ra, rb] = await Promise.all([fs().realPath(a), fs().realPath(b)]);
    return (
      path.normalize(ra).toLowerCase() === path.normalize(rb).toLowerCase()
    );
  } catch {
    return false;
  }
};

/**
 * Where `target` really lives when it is itself a link, else null. Resolving
 * the parent too means a linked Data folder alone doesn't count.
 */
async function linkTarget(
  modulesDir: string,
  target: string,
): Promise<string | null> {
  try {
    const [realTarget, realParent] = await Promise.all([
      fs().realPath(target),
      fs().realPath(modulesDir),
    ]);
    const plain = path.join(realParent, path.basename(target));
    return path.normalize(realTarget).toLowerCase() ===
      path.normalize(plain).toLowerCase()
      ? null
      : realTarget;
  } catch {
    return null;
  }
}

const readOrNull =(file: string): Promise<string | null> =>
  fs()
    .readText(file)
    .catch(() => null);

/** Where the bridge would deploy from and to, and whether it needs to. */
export async function bridgeDeployStatus(): Promise<BridgeDeployStatus> {
  const { repo, data } = bridgePaths();
  const status: BridgeDeployStatus = {
    state: 'unset',
    sourceDir: null,
    target: null,
    sourceVersion: null,
    installedVersion: null,
    changed: [],
    message: '',
  };

  if (!repo || !data) {
    status.message = !repo
      ? 'The bundled bridge module was not found, so it cannot be deployed.'
      : 'Set the Foundry Data folder (Deployment) to deploy the bridge module.';
    return status;
  }

  const sourceDir = await findModuleDir(resolveLocalDir(repo));
  if (!sourceDir) {
    status.state = 'no-source';
    status.message = `No ${BRIDGE_MODULE_ID} module.json in ${repo}, or in a ${BRIDGE_MODULE_ID} folder inside it.`;
    return status;
  }
  status.sourceDir = sourceDir;
  status.sourceVersion = (await readModuleJson(sourceDir))?.version ?? null;

  const modulesDir = await findModulesDir(resolveLocalDir(data));
  if (!modulesDir) {
    status.state = 'no-foundry';
    status.message = `No modules folder in ${data}. Point it at Foundry's user data folder or its Data folder.`;
    return status;
  }
  const target = path.join(modulesDir, BRIDGE_MODULE_ID);
  status.target = target;

  if (!(await isDir(target))) {
    status.state = 'missing';
    status.message = `Not installed in ${modulesDir}.`;
    return status;
  }
  status.installedVersion = (await readModuleJson(target))?.version ?? null;

  if (await samePath(target, sourceDir)) {
    status.state = 'linked';
    status.message =
      'Foundry loads the module straight from the source folder (or a link to it), so there is nothing to copy.';
    return status;
  }
  const linkedTo = await linkTarget(modulesDir, target);
  if (linkedTo) {
    status.state = 'linked';
    status.message = `The installed module is a link to ${linkedTo}, so Foundry loads it from there. Deploy never writes through a link.`;
    return status;
  }

  for (const file of await moduleFiles(sourceDir)) {
    const [from, to] = await Promise.all([
      readOrNull(path.join(sourceDir, file)),
      readOrNull(path.join(target, file)),
    ]);
    if (from === null || from !== to) status.changed.push(file);
  }
  status.state = status.changed.length ? 'outdated' : 'current';
  status.message = status.changed.length
    ? `${status.changed.length} file(s) differ from the bundled module. Reload the world after deploying.`
    : 'Installed and identical to the bundled module.';
  return status;
}

/** Copy every module file into Foundry, overwriting. Refuses a linked install. */
export async function deployBridge(): Promise<BridgeDeployResult> {
  const status = await bridgeDeployStatus();
  if (!status.sourceDir || !status.target || status.state === 'linked')
    throw new Error(status.message);

  const files = await moduleFiles(status.sourceDir);
  for (const file of files) {
    const to = path.join(status.target, file);
    await fs().mkdir(path.dirname(to));
    await fs().copyFile(path.join(status.sourceDir, file), to);
  }
  return {
    target: status.target,
    copied: files.length,
    version: status.sourceVersion,
  };
}

/**
 * Deploy when both paths are set and the install is missing or stale; what a
 * Settings save runs. Returns the result, or null when nothing needed copying.
 */
export async function syncBridge(): Promise<BridgeDeployResult | null> {
  const { state } = await bridgeDeployStatus();
  return state === 'missing' || state === 'outdated' ? deployBridge() : null;
}
