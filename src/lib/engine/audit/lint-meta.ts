/**
 * engine/audit/lint-meta.ts — the `_meta` half of the submission lint: source
 * ids (BrewCleaner, the brew schema), timestamps, edition, and whether the
 * sources a file uses match its edition (BrewTesterEdition).
 * submission-lint.ts runs it first; see there for the severity model.
 */
import type { SiteSources } from './site-sources.ts';
import type { LintIssue } from './submission-lint.ts';
import { isObj, nonBlank, type Obj } from '../../util.ts';

const RE_VALID_SOURCE_CHARS = /^[-a-zA-Z0-9 :&+!]+$/;
const RE_SOURCE_JSON =
  /^([-a-zA-Z0-9&+!]{1,2}|[-a-zA-Z0-9&+!][-a-zA-Z0-9&+! ]+[-a-zA-Z0-9&+!])$/;
const MAX_TIMESTAMP = 9999999999;

/** Walk every string in a value. */
export function eachString(v: unknown, fn: (s: string) => void): void {
  if (typeof v === 'string') fn(v);
  else if (Array.isArray(v)) for (const x of v) eachString(x, fn);
  else if (isObj(v)) for (const x of Object.values(v)) eachString(x, fn);
}

const RE_NAIVE_TAG = /\{@[^ ]+ [^|]+\|([^|}]+)/g;

/** Sources used by a doc, exactly as BrewTesterEdition._getSourcesUsed finds them. */
function sourcesUsed(doc: Obj): string[] {
  const meta = (doc._meta ?? {}) as Obj;
  const out = new Set<string>();
  for (const k of ['dependencies', 'includes'])
    if (isObj(meta[k]))
      for (const v of Object.values(meta[k] as Obj).flat())
        if (typeof v === 'string') out.add(v);
  for (const [, arr] of Object.entries(doc)) {
    if (!Array.isArray(arr)) continue;
    for (const ent of arr as Obj[]) {
      if (!isObj(ent)) continue;
      for (const s of [
        ent.source,
        (ent.inherits as Obj | undefined)?.source,
        (ent._copy as Obj | undefined)?.source,
        ...((
          (ent._copy as Obj | undefined)?._templates as Obj[] | undefined
        )?.map((t) => t?.source) ?? []),
        ...((ent.otherSources as Obj[] | undefined)?.map((o) => o?.source) ??
          []),
        ...((ent.referenceSources as unknown[] | undefined) ?? []),
      ])
        if (typeof s === 'string' && s) out.add(s);
      eachString(ent, (s) => {
        for (const m of s.matchAll(RE_NAIVE_TAG)) out.add(m[1]);
      });
    }
  }
  return [...out];
}

export type AddIssue = (
  severity: LintIssue['severity'],
  rule: string,
  message: string,
  ci?: string,
) => void;

/**
 * Check `doc._meta` and return the source ids it declares, or null when there
 * is no `_meta` at all (nothing else in the file can be checked then).
 */
export function lintMeta(
  doc: Obj,
  site: SiteSources,
  now: number,
  add: AddIssue,
): Set<string> | null {
  const meta = doc._meta;
  if (!isObj(meta)) {
    add(
      'error',
      'meta.missing',
      'no "_meta" block — every brew needs one',
      'test:clean',
    );
    return null;
  }
  const firstKeys = Object.keys(doc).filter((k) => k !== '$schema');
  if (firstKeys[0] !== '_meta')
    add(
      'info',
      'meta.order',
      '"_meta" should be the first key (the cleaner moves it)',
      'test:clean',
    );

  const sources = meta.sources;
  const declared = new Set<string>();
  if (!Array.isArray(sources) || !sources.length) {
    add(
      'error',
      'meta.sources',
      '"_meta.sources" must be a non-empty array',
      'test:json',
    );
  } else {
    sources.forEach((raw, i) => {
      const s = (isObj(raw) ? raw : {}) as Obj;
      const json = nonBlank(s.json);
      const label = json ? `source "${json}"` : `_meta.sources[${i}]`;
      if (!json) {
        add('error', 'source.json', `${label} has no "json" id`, 'test:json');
        return;
      }
      declared.add(json);
      for (const req of ['abbreviation', 'full'])
        if (!nonBlank(s[req]))
          add(
            'error',
            `source.${req}`,
            `${label} is missing "${req}"`,
            'test:json',
          );
      if (s.version == null)
        add(
          'warning',
          'source.version',
          `${label} has no "version" (the cleaner inserts "unknown")`,
          'test:clean',
        );
      if (!Array.isArray(s.authors) || !s.authors.length)
        add(
          'warning',
          'source.authors',
          `${label} has no "authors" — credit the creator`,
        );
      if (!nonBlank(s.url))
        add(
          'warning',
          'source.url',
          `${label} has no "url" linking to the original work`,
        );
      if (s.convertedBy !== undefined && !Array.isArray(s.convertedBy))
        add(
          'error',
          'source.convertedBy',
          `${label} "convertedBy" must be an array of names`,
          'test:json',
        );
      for (const c of ['color', 'colorNight'])
        if (
          s[c] != null &&
          !/^([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(String(s[c]))
        )
          add(
            'error',
            `source.${c}`,
            `${label} "${c}" must be a hex colour without "#" (e.g. "ff00ff")`,
            'test:json',
          );

      const lc = json.toLowerCase();
      if (!RE_VALID_SOURCE_CHARS.test(json))
        add(
          'error',
          'source.chars',
          `${label} contains characters outside [-a-zA-Z0-9 :&+!]`,
          'test:clean',
        );
      if (!site.legacy.has(lc)) {
        if (site.official.has(lc))
          add(
            'error',
            'source.official',
            `${label} is an official 5etools source id — pick a unique one`,
            'test:json',
          );
        else if (/^(?:UA|XUA)/.test(json))
          add(
            'error',
            'source.ua',
            `${label} may not start with "UA"/"XUA" (reserved for prerelease content)`,
            'test:json',
          );
        else if (json.length < 6)
          add(
            'error',
            'source.length',
            `${label} is shorter than 6 characters — new source ids must be at least 6`,
            'test:json',
          );
        else if (!RE_SOURCE_JSON.test(json))
          add(
            'error',
            'source.pattern',
            `${label} must start and end with a letter/digit/&+!- and contain no other characters`,
            'test:json',
          );
      }
    });
  }

  // Timestamps (BrewCleaner: missing → added; ms → converted).
  for (const k of ['dateAdded', 'dateLastModified'] as const) {
    const v = meta[k];
    if (v == null)
      add(
        'warning',
        `meta.${k}`,
        `"_meta.${k}" is missing (the cleaner will stamp the merge time)`,
        'test:clean',
      );
    else if (typeof v !== 'number' || !Number.isInteger(v))
      add(
        'error',
        `meta.${k}`,
        `"_meta.${k}" must be an integer unix timestamp in seconds`,
        'test:json',
      );
    else if (v > MAX_TIMESTAMP)
      add(
        'warning',
        `meta.${k}`,
        `"_meta.${k}" looks like milliseconds — use seconds (${Math.round(v / 1000)})`,
        'test:clean',
      );
    else if (v > now + 86400)
      add(
        'warning',
        `meta.${k}`,
        `"_meta.${k}" is in the future (${new Date(v * 1000).toISOString().slice(0, 10)})`,
      );
  }
  if (
    typeof meta.dateAdded === 'number' &&
    typeof meta.dateLastModified === 'number' &&
    meta.dateLastModified < meta.dateAdded &&
    meta.dateAdded <= MAX_TIMESTAMP
  )
    add(
      'warning',
      'meta.dateOrder',
      '"dateLastModified" is earlier than "dateAdded"',
    );

  // Edition.
  const edition = meta.edition;
  if (edition == null)
    add(
      'error',
      'meta.edition',
      '"_meta.edition" is required — "classic" (2014) or "one" (2024); use "classic" if unsure',
      'test:json',
    );
  else if (edition !== 'classic' && edition !== 'one')
    add(
      'error',
      'meta.edition',
      `"_meta.edition" must be "classic" or "one", not ${JSON.stringify(edition)}`,
      'test:json',
    );
  if (edition === 'classic') {
    // BrewTesterEdition: only an EXPLICIT classic is checked.
    const modern = sourcesUsed(doc).filter(
      (s) => site.edition.get(s.toLowerCase()) === 'one',
    );
    if (modern.length)
      add(
        'error',
        'edition.modernSources',
        `marked "edition": "classic" but uses 2024 source${modern.length === 1 ? '' : 's'} ${[...new Set(modern)].map((s) => `"${s}"`).join(', ')} — set "edition": "one" or relink`,
        'test:edition-sources',
      );
  }
  // Spell class lists must match the file's edition.
  const fileEd = edition === 'one' ? 'one' : 'classic';
  for (const sp of (Array.isArray(doc.spell) ? doc.spell : []) as Obj[]) {
    const cls = (sp?.classes ?? {}) as Obj;
    const metas: [string, Obj][] = [
      ...((cls.fromClassList as Obj[] | undefined) ?? []).map(
        (c) => ['fromClassList', c] as [string, Obj],
      ),
      ...((cls.fromClassListVariant as Obj[] | undefined) ?? []).map(
        (c) => ['fromClassListVariant', c] as [string, Obj],
      ),
      ...((cls.fromSubclass as Obj[] | undefined) ?? []).map(
        (c) => ['fromSubclass', c?.class as Obj] as [string, Obj],
      ),
    ];
    for (const [prop, c] of metas) {
      const ed = site.edition.get(String(c?.source ?? '').toLowerCase());
      if (ed && ed !== fileEd)
        add(
          'error',
          'edition.spellClass',
          `spell "${sp.name}" (${fileEd}) lists ${prop} "${c.name}" (${c.source}) from edition "${ed}"`,
          'test:edition-sources',
        );
    }
  }
  return declared;
}
