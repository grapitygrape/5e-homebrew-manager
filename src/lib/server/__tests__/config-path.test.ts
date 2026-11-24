/** Where the Node build looks for hbm-config.json. */
import { describe, it, expect } from 'vitest';
import { appConfigFile, resolveConfigPath } from '../config-path.ts';

const ID = '5e Homebrew Manager';

describe('appConfigFile', () => {
  it('uses APPDATA on Windows', () => {
    expect(
      appConfigFile(
        { APPDATA: 'C:\\Users\\j\\AppData\\Roaming' },
        'win32',
        'C:\\Users\\j',
      ),
    ).toBe(`C:/Users/j/AppData/Roaming/${ID}/hbm-config.json`);
  });
  it('uses Application Support on macOS', () => {
    expect(appConfigFile({}, 'darwin', '/Users/j')).toBe(
      `/Users/j/Library/Application Support/${ID}/hbm-config.json`,
    );
  });
  it('uses XDG_CONFIG_HOME, else ~/.config, elsewhere', () => {
    expect(appConfigFile({ XDG_CONFIG_HOME: '/x' }, 'linux', '/home/j')).toBe(
      `/x/${ID}/hbm-config.json`,
    );
    expect(appConfigFile({}, 'linux', '/home/j')).toBe(
      `/home/j/.config/${ID}/hbm-config.json`,
    );
  });
});

describe('resolveConfigPath', () => {
  const app = `/home/j/.config/${ID}/hbm-config.json`;
  const opts = (exists: string[], env: Record<string, string> = {}) => ({
    env,
    cwd: '/repo',
    platform: 'linux' as const,
    home: '/home/j',
    exists: (p: string) => exists.includes(p),
  });

  it('takes HBM_CONFIG_PATH first', () => {
    expect(
      resolveConfigPath(opts([app], { HBM_CONFIG_PATH: '/elsewhere/c.json' })),
    ).toBe('/elsewhere/c.json');
  });
  it('prefers the app-config file when it exists', () => {
    expect(
      resolveConfigPath(opts([app, '/repo/hbm-config.json'])),
    ).toBe(app);
  });
  it('falls back to the old file in the cwd', () => {
    expect(resolveConfigPath(opts(['/repo/hbm-config.json']))).toBe(
      '/repo/hbm-config.json',
    );
  });
  it('names the app-config file when neither exists', () => {
    expect(resolveConfigPath(opts([]))).toBe(app);
  });
});
