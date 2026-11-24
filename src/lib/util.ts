/**
 * lib/util.ts - tiny shared helpers safe for both server and client.
 */

const integerFormat = new Intl.NumberFormat('en-US');
const localDateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Default cap for concurrent file/IPC reads in `mapPool`. */
export const DEFAULT_IO_CONCURRENCY = 16;

/** Run `fn` across `items` with bounded concurrency, preserving input order. */
export async function mapPool<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = DEFAULT_IO_CONCURRENCY,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

/** Human-readable message from an unknown thrown value. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Pretty display name for a guide filename, e.g. `feat-conversion.md` -> `Feat`. */
export function guideTitle(file: string): string {
  return file
    .replace(/-conversion\.md$|\.md$/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Group digits with commas, e.g. `12345` -> `12,345`. */
export function formatNumber(n: number): string {
  return integerFormat.format(n);
}

/** Pick singular or plural form by count (`many` defaults to `${one}s`). */
export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

export interface FolderOutcome {
  ok: boolean;
  text: string;
}

/** Summarize a per-folder deploy or library operation: count phrase + per-folder errors. */
export function formatFolderOutcome(
  verb: string,
  doneCount: number,
  errors: { label: string; message: string; file?: string }[],
  fallback = 'Failed',
): FolderOutcome {
  const bits: string[] = [];
  if (doneCount)
    bits.push(`${verb} ${doneCount} ${plural(doneCount, 'folder')}`);
  for (const e of errors)
    bits.push(
      e.file
        ? `${e.label}: ${e.file} — ${e.message}`
        : `${e.label}: ${e.message}`,
    );
  return {
    ok: doneCount > 0 && errors.length === 0,
    text: bits.join(' · ') || fallback,
  };
}

/** A parsed JSON object. */
export type Obj = Record<string, unknown>;

/** True for a JSON object: not null, not an array. */
export function isObj(v: unknown): v is Obj {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** The string when it has non-whitespace text, otherwise null. */
export function nonBlank(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Filter an unknown value down to its string elements (empty array otherwise). */
export function stringList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string')
    : [];
}

/** Escape text for safe insertion into HTML strings used with `{@html}`. */
export function escapeHtml(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );
}

/** Human file size from bytes - KB below 1 MB, otherwise MB. */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1048576)
    return `${formatNumber(Math.round(bytes / 1048576))} MB`;
  return `${formatNumber(Math.round(bytes / 1024))} KB`;
}

/** Locale date from epoch ms (browser-local calendar day). */
export function formatLocalDate(ms: number): string {
  if (!ms) return '';
  return localDateFormat.format(ms);
}

/**
 * UTC calendar date for corpus stamps (`yyyy-MM-dd`).
 * Use when the stored day must not shift with the viewer's timezone.
 */
export function formatUtcDate(ms: number | null): string {
  if (ms === null) return '-';
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
