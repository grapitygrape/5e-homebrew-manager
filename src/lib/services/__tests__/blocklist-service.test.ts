/** Tests for blocklist-service: pre-index view info. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { blocklistViewInfo } from '../blocklist-service.ts';
import { setConfigProvider } from '../config.ts';
import { resetDataSource } from '../datasource.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { nodeConfigProvider } from '$lib/server/config-store';

let root = '';
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-blocklist-'));
});
afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  resetDataSource();
  await rm(root, { recursive: true, force: true });
});

/** Point services at an hbm-config.json in `root`, as the desktop shell does. */
async function useConfig(stored: unknown): Promise<void> {
  const configPath = path.join(root, 'hbm-config.json');
  await writeFile(configPath, JSON.stringify(stored));
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
  resetDataSource();
}

describe('blocklistViewInfo', () => {
  it('can save and deploy a local homebrew folder with a destination', async () => {
    await useConfig({
      homebrew: { path: './homebrew' },
      app: { foundryHomebrew: '', deployedHomebrew: './deployed' },
    });
    expect(blocklistViewInfo()).toMatchObject({
      homebrewPath: './homebrew',
      canSave: true,
      canDeploy: true,
      indexWarm: false,
    });
  });

  it('cannot save a URL homebrew source or deploy with no destination', async () => {
    await useConfig({
      homebrew: { url: 'https://example.com/homebrew/' },
      app: { foundryHomebrew: '', deployedHomebrew: 'https://example.com/x' },
    });
    expect(blocklistViewInfo()).toMatchObject({
      canSave: false,
      canDeploy: false,
    });
  });
});
