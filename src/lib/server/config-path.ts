/**
 * lib/server/config-path.ts — where the Node build finds hbm-config.json.
 *
 * INTENT
 *   The desktop app and the Node build must read the same file, so this
 *   follows the order config.rs uses: HBM_CONFIG_PATH, then the app's folder
 *   in the OS config folder, then the old file in the cwd. Only Rust copies
 *   or moves files; until the desktop app has run once, Node reads them
 *   where they are.
 */
// Relative, so the CLI scripts can load this under plain Node too.
import { join } from '../fs/path.ts';

/** The installed copy's data folder. config.rs uses the same names. */
const APP_FOLDER = '5e Homebrew Manager';
const FILE = 'hbm-config.json';

type Env = Record<string, string | undefined>;

function osConfigDir(env: Env, platform: string, home: string): string {
  if (platform === 'win32') return env.APPDATA ?? join(home, 'AppData/Roaming');
  if (platform === 'darwin') return join(home, 'Library/Application Support');
  return env.XDG_CONFIG_HOME || join(home, '.config');
}

/** The app's config file in the OS config folder. */
export function appConfigFile(
  env: Env,
  platform: string,
  home: string,
  folder: string = APP_FOLDER,
): string {
  return join(osConfigDir(env, platform, home), folder, FILE);
}

export function resolveConfigPath(opts: {
  env: Env;
  cwd: string;
  platform: string;
  home: string;
  exists: (path: string) => boolean;
}): string {
  if (opts.env.HBM_CONFIG_PATH) return opts.env.HBM_CONFIG_PATH;
  const appFile = appConfigFile(opts.env, opts.platform, opts.home);
  const legacy = join(opts.cwd, FILE);
  return [appFile, legacy].find(opts.exists) ?? appFile;
}
