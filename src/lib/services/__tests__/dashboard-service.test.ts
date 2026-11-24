/**
 * The Dashboard's setup flags (finished or not, which repos are missing) and
 * how it reports a failed audit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countSourcesInUse, dashboardView } from '../dashboard-service.ts';
import { setConfigProvider } from '../config.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { resetDataSource } from '../datasource.ts';
import { nodeConfigProvider } from '$lib/server/config-store';
import { runAudit } from '../audit-service.ts';

// The real audit, unless a test makes it fail.
vi.mock('../audit-service.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../audit-service.ts')>();
  return { ...real, runAudit: vi.fn(real.runAudit) };
});

let root = '';
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-dashboard-'));
});
afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  resetDataSource();
  await rm(root, { recursive: true, force: true });
});

async function useConfig(stored: unknown): Promise<void> {
  const configPath = path.join(root, 'hbm-config.json');
  await writeFile(configPath, JSON.stringify(stored));
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
  resetDataSource();
}

describe('dashboardView setup flags', () => {
  it('lists required repos whose folder is missing', async () => {
    await mkdir(path.join(root, 'tools'));
    await useConfig({
      setup: { completedAt: '2026-10-18T00:00:00Z' },
      sourceRepos: {
        tools: { url: 'u', path: path.join(root, 'tools') },
        homebrew: { url: 'u', path: path.join(root, 'nope') },
        images: { url: 'u', path: path.join(root, 'also-nope') },
      },
    });
    const view = await dashboardView();
    expect(view.setupCompleted).toBe(true);
    expect(view.missingRepos).toEqual(['Homebrew files', 'Homebrew utilities']);
  });

  it('reports setup unfinished', async () => {
    await useConfig({});
    expect((await dashboardView()).setupCompleted).toBe(false);
  });
});

describe('dashboardView audit', () => {
  it('keeps the reason when the audit fails', async () => {
    await useConfig({});
    vi.mocked(runAudit).mockRejectedValueOnce(new Error('schema unreadable'));
    const view = await dashboardView();
    expect(view.audit).toBeNull();
    expect(view.auditError).toBe('schema unreadable');
  });

  it('has no error when the audit runs', async () => {
    await useConfig({});
    expect((await dashboardView()).auditError).toBeNull();
  });

  it('skips a cold audit when includeAudit is false', async () => {
    await useConfig({});
    vi.mocked(runAudit).mockClear();
    const view = await dashboardView({ includeAudit: false });
    expect(view.audit).toBeNull();
    expect(view.auditError).toBeNull();
    expect(runAudit).not.toHaveBeenCalled();
  });
});

describe('dashboardView sources', () => {
  it('lists configured locations and leaves unset ones out', async () => {
    await useConfig({
      guides: { path: 'G:/guides' },
      homebrew: { url: 'https://example.com/brew/' },
      sourceRepos: {
        tools: { url: 'https://github.com/a/tools', path: 'C:/h/tools' },
        homebrew: { url: '', path: 'C:/h/homebrew' },
      },
      app: { siteDeployFolders: ['W:/5e', 'X:/copy'] },
    });
    const byLabel = Object.fromEntries(
      (await dashboardView()).sources.map((s) => [s.label, s.targets]),
    );
    expect(byLabel['Guides']).toEqual(['G:/guides']);
    expect(byLabel['Homebrew']).toEqual(['https://example.com/brew/']);
    expect(byLabel['Tools source repo']).toEqual([
      'C:/h/tools',
      'https://github.com/a/tools',
    ]);
    expect(byLabel['Homebrew files repo']).toEqual(['C:/h/homebrew']);
    expect(byLabel['Site deploy folders']).toEqual(['W:/5e', 'X:/copy']);
    expect(byLabel).not.toHaveProperty('Partnered brews');
    expect(byLabel).not.toHaveProperty('Homebrew images repo');
  });
});

describe('countSourcesInUse', () => {
  const src = (
    source: string,
    kind: 'core' | 'brew' | 'dep',
    types = ['spell', 'item'],
  ) => ({
    source,
    isHomebrew: kind !== 'core',
    isDependency: kind === 'dep',
    types: types.map((prop) => ({ prop, label: prop, count: 1 })),
  });
  const rule = (source: string, category = '*', hash = '*') => ({
    source,
    category,
    hash,
  });

  it('splits core, homebrew and dependency sources', () => {
    expect(
      countSourcesInUse(
        [
          src('PHB', 'core'),
          src('XGE', 'core'),
          src('MyBrew', 'brew'),
          src('Dep', 'dep'),
        ],
        [],
      ),
    ).toEqual({ coreSources: 2, homebrewSources: 1, dependencySources: 1 });
  });

  it('leaves out sources a rule hides entirely', () => {
    expect(
      countSourcesInUse(
        [
          src('PHB', 'core'),
          src('XGE', 'core'),
          src('VSS', 'brew'),
          src('Dep', 'dep'),
        ],
        // Whole source, case-insensitive; every type one by one.
        [rule('phb'), rule('VSS', 'spell'), rule('VSS', 'ITEM'), rule('Dep')],
      ),
    ).toEqual({ coreSources: 1, homebrewSources: 0, dependencySources: 0 });
  });

  it('still counts a source with only some of it hidden', () => {
    expect(
      countSourcesInUse(
        [src('PHB', 'core')],
        [rule('PHB', 'spell'), rule('PHB', 'item', 'longsword_phb')],
      ),
    ).toEqual({ coreSources: 1, homebrewSources: 0, dependencySources: 0 });
  });
});
