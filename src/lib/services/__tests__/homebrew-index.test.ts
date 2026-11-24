/** Tests for matching the working homebrew folder against its index.json. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkIndex, resolveMismatch } from '../homebrew-index.ts';

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );
const toImport = async (dir: string) =>
  JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8')).toImport;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'hbm-index-'));
  await mkdir(path.join(dir, 'unused'));
  await writeFile(
    path.join(dir, 'index.json'),
    `${JSON.stringify({ toImport: ['A; Listed.json', 'content-blocklist.json', 'C; Gone.json', 'D; Parked.json'], notUsed: ['E; Old.json'] }, null, '\t')}\n`,
  );
  for (const f of ['A; Listed.json', 'B; Manual.json', 'E; Old.json', 'content-blocklist.json'])
    await writeFile(path.join(dir, f), '{}');
  await writeFile(path.join(dir, 'unused', 'D; Parked.json'), '{}');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('checkIndex', () => {
  it('reports files the index misses and entries with no file', async () => {
    expect(await checkIndex(dir)).toEqual({
      path: dir,
      unlisted: ['B; Manual.json'],
      missing: [
        { file: 'C; Gone.json', inUnused: false },
        { file: 'D; Parked.json', inUnused: true },
      ],
    });
  });

  it('treats every brew as unlisted when the index is the empty template', async () => {
    await writeFile(path.join(dir, 'index.json'), '{"toImport": []}');
    expect((await checkIndex(dir)).unlisted).toEqual([
      'A; Listed.json',
      'B; Manual.json',
      'E; Old.json',
    ]);
  });
});

describe('resolveMismatch', () => {
  it('keep lists the file and leaves it in place', async () => {
    await resolveMismatch('keep', 'B; Manual.json', dir);
    expect(await toImport(dir)).toContain('B; Manual.json');
    expect(await exists(path.join(dir, 'B; Manual.json'))).toBe(true);
  });

  it('unused moves the file out without listing it', async () => {
    await resolveMismatch('unused', 'B; Manual.json', dir);
    expect(await exists(path.join(dir, 'unused', 'B; Manual.json'))).toBe(true);
    expect(await toImport(dir)).not.toContain('B; Manual.json');
  });

  it('restore brings a listed file back from unused/', async () => {
    await resolveMismatch('restore', 'D; Parked.json', dir);
    expect(await exists(path.join(dir, 'D; Parked.json'))).toBe(true);
    expect(await toImport(dir)).toContain('D; Parked.json');
    expect((await checkIndex(dir)).missing.map((m) => m.file)).toEqual(['C; Gone.json']);
  });

  it('drop takes the entry off the list', async () => {
    await resolveMismatch('drop', 'C; Gone.json', dir);
    expect(await toImport(dir)).not.toContain('C; Gone.json');
  });

  it('refuses a path outside the folder', async () => {
    await expect(resolveMismatch('keep', '../x.json', dir)).rejects.toThrow();
  });
});
