/** Tests for where the Replace Content file lives, and save + deploy. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  deploySupersessions,
  loadSupersessions,
  replacementViewInfo,
  saveSupersessions,
} from '../supersession-service.ts';
import { setConfigProvider } from '../config.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { nodeConfigProvider } from '$lib/server/config-store';

let root = '';
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-supersede-'));
});
afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  await rm(root, { recursive: true, force: true });
});

/** Point services at an hbm-config.json in `root`, as the desktop shell does. */
async function useConfig(stored: unknown): Promise<void> {
  const configPath = path.join(root, 'hbm-config.json');
  await writeFile(configPath, JSON.stringify(stored));
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
}

const slashes = (p: string | null) => p?.replace(/\\/g, '/') ?? null;

describe('replacementViewInfo', () => {
  it('saves in the data folder beside the config', async () => {
    await useConfig({ data: { path: './5e/data' } });
    const info = replacementViewInfo();
    expect(slashes(info.authoringPath)).toBe(
      slashes(path.join(root, 'content', 'content-replacement.json')),
    );
    expect(slashes(info.deployPath)).toBe(
      slashes(path.join(root, '5e', 'data', 'content-replacement.json')),
    );
    expect(info.canDeploy).toBe(true);
  });

  it('cannot deploy with no local data root', async () => {
    await useConfig({ data: { url: 'https://example.com/data/' } });
    expect(replacementViewInfo()).toMatchObject({
      deployPath: null,
      canDeploy: false,
    });
  });
});

describe('save and deploy', () => {
  it('writes the authoring copy in the data folder and copies it to the data root', async () => {
    await mkdir(path.join(root, 'data'));
    await useConfig({ data: { path: './data' } });

    const saved = await saveSupersessions({
      rows: [],
      review: [],
      envelope: {},
      overrides: [],
    });
    expect(saved.count).toBe(0);
    expect((await loadSupersessions()).fileExists).toBe(true);

    await deploySupersessions();
    const authoring = path.join(root, 'content', 'content-replacement.json');
    expect(
      await readFile(
        path.join(root, 'data', 'content-replacement.json'),
        'utf8',
      ),
    ).toBe(await readFile(authoring, 'utf8'));
  });

  it('refuses to deploy before anything is saved', async () => {
    await useConfig({ data: { path: './data' } });
    await expect(deploySupersessions()).rejects.toThrow('Nothing saved yet');
  });
});
