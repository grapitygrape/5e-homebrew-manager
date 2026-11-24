/**
 * lib/server/node-fs.ts — the FsAdapter for the Node dev server and tests.
 * Server-only (node:fs); the desktop build uses lib/fs/tauri-fs.ts instead.
 */
import { promises as nodeFs } from 'node:fs';
import { join } from '$lib/fs/path';
import { mapPool } from '$lib/util';
import type { FsAdapter } from '$lib/fs';

export const nodeFsAdapter: FsAdapter = {
  readText: (file) => nodeFs.readFile(file, 'utf8'),
  readManyText: (files) =>
    mapPool(files, (file) => nodeFs.readFile(file, 'utf8').catch(() => null)),
  writeText: (file, text) => nodeFs.writeFile(file, text, 'utf8'),
  async readDir(dir) {
    const entries = await nodeFs.readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isFile: e.isFile(),
      isDirectory: e.isDirectory(),
    }));
  },
  async walkFiles(root, ext) {
    const out: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries;
      try {
        entries = await nodeFs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await walk(join(dir, entry.name), childRel);
        else if (entry.name.endsWith(ext)) out.push(childRel);
      }
    };
    await walk(root, '');
    return out.sort();
  },
  async stat(target) {
    const st = await nodeFs.stat(target);
    return {
      size: st.size,
      mtimeMs: st.mtimeMs,
      isFile: st.isFile(),
      isDirectory: st.isDirectory(),
    };
  },
  exists: (target) =>
    nodeFs.stat(target).then(
      () => true,
      () => false,
    ),
  mkdir: async (dir) => {
    await nodeFs.mkdir(dir, { recursive: true });
  },
  copyFile: (from, to) => nodeFs.copyFile(from, to),
  rename: (from, to) => nodeFs.rename(from, to),
  realPath: (target) => nodeFs.realpath(target),
};
