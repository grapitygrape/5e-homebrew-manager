/**
 * engine/supersession/parse-marker.ts - read a "Replaces:" marker off homebrew.
 *
 * Spells That Don't Suck states every mapping as the first line of a spell's
 * `entries`: `{@b Replaces:} {@spell Shield|PHB}`. That is machine-readable
 * enough to bootstrap and not machine-readable enough to trust - a meaningful
 * minority are not 1:1 ("A and B", "(in part)", "(with C)").
 *
 * A non-null `reason` means "do not emit a row, send it to _review".
 */

/** The marker itself, anchored to the start of a `{@b Replaces:}` bold run. */
const RE_REPLACES = /\{@b\s+Replaces:?\}\s*(.*)$/i;
/** Every `{@tag Name|Source}` inside the marker text. */
const RE_TAG = /\{@(\w+)\s+([^}]+)\}/g;

/** One original named by a marker. `source` is '' when the tag omitted it. */
export interface MarkerTarget {
  tag: string;
  name: string;
  source: string;
}

export interface MarkerParse {
  /** The marker text with trailing punctuation trimmed; '' when there was none. */
  marker: string;
  targets: MarkerTarget[];
  /** null when the marker is a clean redirect; otherwise why it isn't. */
  reason: string | null;
}

/** A loose entity - only `entries` is read. */
export interface MarkedEntity {
  entries?: unknown;
}

/**
 * Parse the marker on `ent`.
 *
 * Only the FIRST string entry is considered. A marker
 * buried further down is not a convention anyone writes to, and scanning the
 * whole body would start matching prose that merely mentions a replacement.
 */
export function parseReplacesMarker(
  ent: MarkedEntity,
  opts: { ownSource: string },
): MarkerParse {
  const entries = Array.isArray(ent?.entries) ? ent.entries : [];
  const first = entries.find((it): it is string => typeof it === 'string');
  if (!first) return { marker: '', targets: [], reason: 'no text entry' };

  const m = first.match(RE_REPLACES);
  if (!m) return { marker: '', targets: [], reason: 'no "Replaces:" marker' };

  const marker = m[1].trim().replace(/[.\s]+$/, '');

  const targets: MarkerTarget[] = [];
  for (const tagMatch of marker.matchAll(RE_TAG)) {
    const [, tag, body] = tagMatch;
    const [name, source] = body.split('|').map((it) => it.trim());
    targets.push({ tag, name: name ?? '', source: source ?? '' });
  }

  if (!targets.length) {
    return { marker, targets, reason: `no tag in marker: "${marker}"` };
  }

  // Anything qualified, conditional, or self-referential is not a clean redirect.
  if (/\(in part\)/i.test(marker)) {
    return { marker, targets, reason: `qualified "(in part)": "${marker}"` };
  }
  if (/\(with\s/i.test(marker)) {
    return {
      marker,
      targets,
      reason: `conditional "(with \u2026)": "${marker}"`,
    };
  }
  const own = (opts.ownSource ?? '').toLowerCase();
  if (targets.some((it) => (it.source || '').toLowerCase() === own)) {
    return {
      marker,
      targets,
      reason: `references its own source: "${marker}"`,
    };
  }
  if (targets.some((it) => !it.source)) {
    return { marker, targets, reason: `tag without a source: "${marker}"` };
  }

  return { marker, targets, reason: null };
}
