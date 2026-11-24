/**
 * Shared extraction of display name, authors, and entity counts from a
 * homebrew JSON body. Used by every DataSource listHomebrew implementation.
 */
import type { HomebrewFileMeta, SourceDisplay } from './source.ts';

/** Join `_meta.sources[0].authors` into a display string. */
export function formatAuthors(authors: unknown): string {
  if (Array.isArray(authors)) {
    return authors
      .filter((a): a is string => typeof a === 'string' && !!a.trim())
      .join(', ');
  }
  if (typeof authors === 'string') return authors.trim();
  return '';
}

/** The first non-blank string among the candidates, trimmed; '' if none. */
function firstText(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** A `_meta` hex colour ("9661ab", no "#") as CSS; '' when absent or not hex. */
export function hexColor(value: unknown): string {
  const hex = typeof value === 'string' ? value.trim().replace(/^#/, '') : '';
  return /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)
    ? `#${hex}`
    : '';
}

type MetaSource = {
  json?: unknown;
  abbreviation?: unknown;
  color?: unknown;
  colorNight?: unknown;
  full?: string;
  authors?: unknown;
};

/** One `_meta.sources[]` record as people see it; null without a json id. */
function brewSource(rec: MetaSource): SourceDisplay | null {
  const json = firstText(rec.json);
  if (!json) return null;
  return {
    json,
    abbreviation: firstText(rec.abbreviation, json),
    // The app is dark, so the night colour wins, as in 5etools' night mode.
    color: hexColor(rec.colorNight) || hexColor(rec.color),
  };
}

function rawSources(json: Record<string, unknown>): MetaSource[] {
  const raw = (json._meta as { sources?: unknown } | undefined)?.sources;
  return Array.isArray(raw) ? raw : [];
}

/** Every source a brew declares, as people see it. */
export function metaSources(json: Record<string, unknown>): SourceDisplay[] {
  return rawSources(json)
    .map((rec) => brewSource(rec ?? {}))
    .filter((s): s is SourceDisplay => s !== null);
}

/** Fill name, authors, sources and counts from a parsed homebrew file. */
export function applyHomebrewJson(
  meta: HomebrewFileMeta,
  json: Record<string, unknown>,
): void {
  const sources = rawSources(json);
  if (sources[0]?.full) meta.name = sources[0].full;
  meta.authors = formatAuthors(sources[0]?.authors);
  meta.sources = metaSources(json);
  const modified = (json._meta as { dateLastModified?: unknown } | undefined)
    ?.dateLastModified;
  if (typeof modified === 'number') meta.dateLastModified = modified;
  for (const [k, v] of Object.entries(json)) {
    if (Array.isArray(v) && v.length && k !== '_meta')
      meta.counts[k] = v.length;
  }
}

export function blankHomebrewMeta(file: string): HomebrewFileMeta {
  return {
    file,
    name: file,
    size: 0,
    counts: {},
    error: null,
    authors: '',
    sources: [],
    mtime: 0,
    dateLastModified: 0,
  };
}
