/**
 * lib/fs — the file system as the app sees it, independent of runtime.
 *
 * INTENT
 *   Services and the FsDataSource read and write through `fs()` instead of
 *   importing node:fs, so the same code runs on the Node dev server (and in
 *   tests) and in the Tauri webview, where Rust does the I/O. Whoever boots the
 *   runtime registers an adapter once: hooks.server.ts and the Vitest setup
 *   register the Node one, the desktop shell registers the Tauri one.
 *
 * ERRORS
 *   Every method rejects with an `Error` when the OS call fails (missing file,
 *   permission denied). Callers already treat "missing" defensively, so the
 *   adapters don't distinguish error kinds.
 */
import * as path from './path.ts';
import { mapPool } from '../util.ts';
export { path };

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  /** Included by adapters that fetch file metadata cheaply during readdir (e.g. Tauri). */
  size?: number;
  mtimeMs?: number;
}

export interface FileStat {
  size: number;
  mtimeMs: number;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FsAdapter {
  readText(file: string): Promise<string>;
  /** Batch text read; missing or unreadable paths return `null` at the same index. */
  readManyText(files: string[]): Promise<(string | null)[]>;
  writeText(file: string, text: string): Promise<void>;
  readDir(dir: string): Promise<DirEntry[]>;
  /**
   * Every file under `root` ending in `ext`, recursively, as sorted
   * forward-slash paths relative to `root`. One call instead of a readdir per
   * folder, which matters when each call crosses the Tauri bridge. A missing
   * root yields [], matching how the schema and data walks already behaved.
   */
  walkFiles(root: string, ext: string): Promise<string[]>;
  stat(target: string): Promise<FileStat>;
  exists(target: string): Promise<boolean>;
  /** Recursive; succeeds when the folder already exists. */
  mkdir(dir: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Links and junctions resolved, so two names for one folder compare equal. */
  realPath(target: string): Promise<string>;
}

let current: FsAdapter | null = null;

export function setFs(adapter: FsAdapter): void {
  current = adapter;
}

export function fs(): FsAdapter {
  if (!current)
    throw new Error('No file system adapter registered - call setFs() first.');
  return current;
}

/**
 * Read many text files in bounded chunks so desktop IPC stays responsive
 * (few round-trips, moderate payload sizes) while still reading concurrently.
 */
export async function readManyTextChunked(
  files: readonly string[],
  chunkSize = 32,
  concurrency = 4,
): Promise<(string | null)[]> {
  if (files.length === 0) return [];
  const adapter = fs();
  const chunks: string[][] = [];
  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize));
  }
  const results = await mapPool(
    chunks,
    (chunk) => adapter.readManyText(chunk),
    concurrency,
  );
  return results.flat();
}

/**
 * Write JSON (or a pre-formatted JSON string) to `target`, ensuring its parent
 * folder exists and rotating any previous file to `${target}.bak` first
 * (unless `opts.backup === false`).
 */
export async function writeJsonWithBackup(
  target: string,
  content: string | Record<string, unknown>,
  opts: { backup?: boolean } = {},
): Promise<void> {
  await fs().mkdir(path.dirname(target));
  if (opts.backup !== false) {
    // Rotate before overwriting: if the write below fails, the previous file
    // is still whole on disk under .bak rather than half-overwritten.
    try {
      await fs().copyFile(target, `${target}.bak`);
    } catch {
      /* no existing file to back up */
    }
  }
  const text =
    typeof content === 'string'
      ? content
      : `${JSON.stringify(content, null, 2)}\n`;
  await fs().writeText(target, text);
}
