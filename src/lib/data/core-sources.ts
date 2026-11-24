/**
 * data/core-sources.ts — how 5etools shows its official sources: XPHB reads
 * as PHB'24, in its own colour.
 *
 * Neither lives in `data/`. The abbreviations are a table in `js/parser.js`
 * (`Parser.SOURCE_JSON_TO_ABV`, keyed by `Parser.SRC_*` constants) and the
 * colours are `.ve-source__<json>` rules in the compiled `css/main.css`. Both
 * are read as text and picked apart here, so this stays pure; the adapter
 * only supplies the two files.
 */
import { hexColor } from './homebrew-meta.ts';
import type { SourceDisplay } from './source.ts';

/** `Parser.SRC_X = "…";` or a template built from other constants. */
const RE_CONST =
  /^Parser\.(SRC_[A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|`([^`]*)`)\s*;/gm;
const RE_ABV =
  /^Parser\.SOURCE_JSON_TO_ABV\[Parser\.(SRC_[A-Za-z0-9_]+)\]\s*=\s*"([^"]*)"\s*;/gm;
const RE_RULE = /([^{}]+)\{([^{}]*)\}/g;
const RE_SOURCE_SELECTOR =
  /^(\.ve-night-mode\s+)?\.ve-source__([A-Za-z0-9_-]+)$/;
const RE_COLOR = /(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,8})/;

/** `Parser.SRC_*` constant name → json id, templates resolved. */
function readConstants(parserJs: string): Map<string, string> {
  const raw = new Map<string, string>();
  for (const m of parserJs.matchAll(RE_CONST)) raw.set(m[1], m[2] ?? m[3]);
  const out = new Map<string, string>();
  const resolve = (name: string, depth = 0): string | null => {
    const known = out.get(name);
    if (known !== undefined) return known;
    const value = raw.get(name);
    if (value === undefined || depth > 8) return null;
    let failed = false;
    const text = value.replace(
      /\$\{Parser\.(SRC_[A-Za-z0-9_]+)\}/g,
      (_, ref) => {
        const sub = resolve(ref, depth + 1);
        if (sub === null) failed = true;
        return sub ?? '';
      },
    );
    // Any other interpolation is something we can't evaluate; skip it.
    if (failed || text.includes('${')) return null;
    out.set(name, text);
    return text;
  };
  for (const name of raw.keys()) resolve(name);
  return out;
}

/** CSS class suffix → colour, the night rule winning as the app is dark. */
function readColors(css: string): Map<string, string> {
  const day = new Map<string, string>();
  const night = new Map<string, string>();
  for (const [, selectors, body] of css.matchAll(RE_RULE)) {
    const color = hexColor(RE_COLOR.exec(body)?.[1]);
    if (!color) continue;
    for (const sel of selectors.split(',')) {
      const m = RE_SOURCE_SELECTOR.exec(sel.trim());
      if (m) (m[1] ? night : day).set(m[2].toLowerCase(), color);
    }
  }
  return new Map([...day, ...night]);
}

/** The class 5etools derives from a json id (`Parser.sourceJsonToSourceClassname`). */
const classSuffix = (json: string) =>
  json.replace(/[^A-Za-z0-9-_]/g, '_').toLowerCase();

/** Every official source, keyed by lowercased json id; empty without the files. */
export function parseCoreSources(
  parserJs: string,
  css: string,
): Map<string, SourceDisplay> {
  const constants = readConstants(parserJs);
  const abv = new Map<string, string>();
  for (const m of parserJs.matchAll(RE_ABV)) {
    const json = constants.get(m[1]);
    if (json) abv.set(json.toLowerCase(), m[2]);
  }
  const colors = readColors(css);
  const ix = new Map<string, SourceDisplay>();
  for (const json of constants.values()) {
    if (!json) continue;
    const key = json.toLowerCase();
    ix.set(key, {
      json,
      abbreviation: abv.get(key) ?? json,
      color: colors.get(classSuffix(json)) ?? '',
    });
  }
  return ix;
}
