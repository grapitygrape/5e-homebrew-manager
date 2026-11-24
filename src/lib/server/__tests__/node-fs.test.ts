import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nodeFsAdapter } from '../node-fs';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-nodefs-'));
  await mkdir(path.join(root, 'b', 'nested'), { recursive: true });
  await writeFile(path.join(root, 'z.json'), '{}');
  await writeFile(path.join(root, 'b', 'a.json'), '{}');
  await writeFile(path.join(root, 'b', 'nested', 'c.json'), '{}');
  await writeFile(path.join(root, 'b', 'skip.md'), '');
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('nodeFsAdapter.walkFiles', () => {
  it('returns sorted forward-slash paths relative to the root', async () => {
    expect(await nodeFsAdapter.walkFiles(root, '.json')).toEqual([
      'b/a.json',
      'b/nested/c.json',
      'z.json',
    ]);
  });

  it('treats a missing root as empty', async () => {
    expect(
      await nodeFsAdapter.walkFiles(path.join(root, 'nope'), '.json'),
    ).toEqual([]);
  });
});

describe('nodeFsAdapter.readDir', () => {
  it('reports entry kinds as plain booleans', async () => {
    const entries = await nodeFsAdapter.readDir(root);
    const b = entries.find((e) => e.name === 'b');
    const z = entries.find((e) => e.name === 'z.json');
    expect(b).toMatchObject({ isDirectory: true, isFile: false });
    expect(z).toMatchObject({ isDirectory: false, isFile: true });
  });
});

describe('nodeFsAdapter.readManyText', () => {
  it('reads existing files in order and returns null for missing ones', async () => {
    const out = await nodeFsAdapter.readManyText([
      path.join(root, 'z.json'),
      path.join(root, 'missing.json'),
      path.join(root, 'b', 'a.json'),
    ]);
    expect(out).toEqual(['{}', null, '{}']);
  });
});
