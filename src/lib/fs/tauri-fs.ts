/**
 * lib/fs/tauri-fs.ts — the FsAdapter for the desktop build. Each method is one
 * command in src-tauri/src/fs_cmds.rs.
 */
import { invoke } from '@tauri-apps/api/core';
import type { DirEntry, FileStat, FsAdapter } from './index.ts';

/** Rust commands reject with a bare string; callers expect `err.message`. */
async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export const tauriFsAdapter: FsAdapter = {
  readText: (file) => call<string>('fs_read_text', { path: file }),
  readManyText: (files) =>
    call<(string | null)[]>('fs_read_many_text', { paths: files }),
  writeText: (file, text) => call<void>('fs_write_text', { path: file, text }),
  readDir: (dir) => call<DirEntry[]>('fs_read_dir', { path: dir }),
  walkFiles: (root, ext) => call<string[]>('fs_walk_files', { root, ext }),
  stat: (target) => call<FileStat>('fs_stat', { path: target }),
  exists: (target) => call<boolean>('fs_exists', { path: target }),
  mkdir: (dir) => call<void>('fs_mkdir', { path: dir }),
  copyFile: (from, to) => call<void>('fs_copy_file', { from, to }),
  rename: (from, to) => call<void>('fs_rename', { from, to }),
  realPath: (target) => call<string>('fs_real_path', { path: target }),
};
