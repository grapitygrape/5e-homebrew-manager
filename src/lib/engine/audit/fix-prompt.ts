/**
 * engine/audit/fix-prompt.ts — turn a file's scan + lint results into a prompt
 * a model can fix the file from.
 *
 * INTENT
 *   The scan already knows every problem, entity by entity; this hands that to a
 *   model in one paste. Each entity with a problem goes in as JSON under the
 *   guide that covers it (a weapon or tool item gets its own guide), with the
 *   guide's full path when the guides folder is known. Clean entities are left
 *   out, which keeps a large file's prompt small. The reply format is the
 *   convert prompt's, so the Parser's Merge reply reads it back: one JSON block
 *   keyed by array property, matched on the same identity brew-merge.ts uses.
 *
 * REUSE NOTES
 *   - Pure: callers gather validation (validate-service), lint
 *     (brew-check-service) and folder paths. EntityIssues from validate-service
 *     fits FixPromptEntityIssues as-is.
 *   - guidesForEntity is the one place that picks an entity's guides.
 */
import { ARRAY_PROP_TO_GUIDE } from './guide-map.ts';
import type { LinkIssue } from './link-check.ts';
import type { LintIssue } from './submission-lint.ts';
import type { Collision } from './collisions.ts';
import type { ArrayProp } from '../types.ts';
import { isObj, type Obj } from '../../util.ts';

export interface FixPromptEntityIssues {
  type: string;
  entityIdx: number;
  name: string | null;
  schemaErrors: { message: string }[];
  schemaWarnings: { message: string }[];
  linkErrors: LinkIssue[];
  linkWarnings: LinkIssue[];
}

export interface FixPromptInput {
  file: string;
  /** Where the file lives on disk, when known. */
  filePath?: string;
  doc: Record<string, unknown>;
  issues: FixPromptEntityIssues[];
  lint?: LintIssue[];
  collisions?: Collision[];
  /** The guides folder, so each guide can be cited by its full path. */
  guidesPath?: string;
  /** 5etools-utils version the schemas came from, when known. */
  schemaVersion?: string | null;
}

export interface FixPrompt {
  text: string;
  /** Errors + warnings across entities, lint and collisions. */
  problems: number;
  /** Entities with at least one problem. */
  entities: number;
  guides: string[];
}

const COPY_SPEC = 'Spec_Copy.md';
const META_DOC = 'meta.md';

/** Reference docs to cite when a problem names the property they cover. */
const REFERENCE_BY_PROP: [string, string][] = [
  ['prerequisite', 'prerequisite-reference.md'],
  ['additionalSpells', 'additionalspells-reference.md'],
];

// Item type codes (before any "|source") that have their own guide.
const WEAPON_TYPES = new Set(['M', 'R', 'A', 'AF']);
const TOOL_TYPES = new Set(['AT', 'T', 'GS', 'INS', 'TAH']);
const ITEM_ARRAYS = new Set(['item', 'baseitem', 'magicvariant']);

export type Edition = 'classic' | 'one';

/** The file's edition, or null when it doesn't set one. */
export function editionOf(doc: Obj | null): Edition | null {
  const meta = doc?._meta;
  if (!isObj(meta)) return null;
  return meta.edition === 'one' || meta.edition === 'classic'
    ? meta.edition
    : null;
}

function entityAt(doc: Obj, type: string, idx: number): unknown {
  const arr = doc[type];
  return Array.isArray(arr) ? arr[idx] : undefined;
}

function problemCount(e: FixPromptEntityIssues): number {
  return (
    e.schemaErrors.length +
    e.schemaWarnings.length +
    e.linkErrors.length +
    e.linkWarnings.length
  );
}

/**
 * Whether an item-like entity is a weapon or a tool. Looks at the entity, the
 * base a magic variant inherits from, and what a variant requires.
 */
function itemKind(e: Obj): 'weapon' | 'tool' | null {
  const shapes = [
    e,
    e.inherits,
    ...(Array.isArray(e.requires) ? e.requires : []),
  ];
  for (const s of shapes) {
    if (!isObj(s)) continue;
    const code = typeof s.type === 'string' ? s.type.split('|')[0] : '';
    if (s.weapon === true || s.weaponCategory || WEAPON_TYPES.has(code))
      return 'weapon';
    if (TOOL_TYPES.has(code)) return 'tool';
  }
  return null;
}

/**
 * The guides that cover one entity, most specific first: a weapon's or tool's
 * own guide, then its array's guide, then the copy spec for a `_copy`.
 */
export function guidesForEntity(type: string, entity: unknown): string[] {
  const out: string[] = [];
  const e = isObj(entity) ? entity : {};
  const kind = ITEM_ARRAYS.has(type) ? itemKind(e) : null;
  if (kind) out.push(`${kind}-conversion.md`);
  const guide = ARRAY_PROP_TO_GUIDE[type as ArrayProp];
  if (guide && !out.includes(guide)) out.push(guide);
  if ('_copy' in e) out.push(COPY_SPEC);
  return out;
}

/** Reference docs for the properties an entity's problems mention. */
function referencesFor(e: FixPromptEntityIssues): string[] {
  const text = [
    ...e.schemaErrors.map((m) => m.message),
    ...e.schemaWarnings.map((m) => m.message),
    ...[...e.linkErrors, ...e.linkWarnings].map((l) => `${l.at} ${l.plain}`),
  ].join('\n');
  return REFERENCE_BY_PROP.filter(([prop]) => text.includes(prop)).map(
    ([, doc]) => doc,
  );
}

/** "3 spell, 1 table": the entity arrays a file holds. */
export function contentsLine(doc: Obj): string {
  return Object.entries(doc)
    .filter(([k, v]) => !k.startsWith('_') && Array.isArray(v) && v.length)
    .map(([k, v]) => `${(v as unknown[]).length} ${k}`)
    .join(', ');
}

function sourcesLine(doc: Obj): string {
  const meta = doc._meta;
  const sources =
    isObj(meta) && Array.isArray(meta.sources) ? meta.sources : [];
  return sources
    .map((s) =>
      isObj(s) && typeof s.json === 'string' ? `\`${s.json}\`` : null,
    )
    .filter(Boolean)
    .join(', ');
}

function editionLine(edition: Edition | null): string {
  if (edition === 'one')
    return '- Edition: one (2024 rules). Tag official content with its 2024 source: `{@spell fireball|xphb}`, `{@item dagger|xphb}`.';
  if (edition === 'classic')
    return '- Edition: classic (2014 rules). Tag official content with its 2014 source: `{@spell fireball}` (PHB is the default), `{@item dagger|phb}`. A 2024 source (`xphb`, `xdmg`, `xmm`) is an error.';
  return '- Edition: not set. Match the tags already in the file.';
}

// Most link messages already quote the tag; name it only when one doesn't.
const link = (label: string, l: LinkIssue) =>
  l.plain.includes(l.raw)
    ? `- ${label} (in \`${l.at}\`): ${l.plain}`
    : `- ${label} \`${l.raw}\` (in \`${l.at}\`): ${l.plain}`;

/** Collapse repeated lines (the same broken tag in five places) into one. */
function tally(lines: string[]): string[] {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([l, n]) => (n > 1 ? `${l} (×${n})` : l));
}

export function buildFixPrompt(input: FixPromptInput): FixPrompt {
  const { file, doc } = input;
  const issues = input.issues.filter((e) => problemCount(e) > 0);
  const lint = (input.lint ?? []).filter((i) => i.severity !== 'info');
  const collisions = input.collisions ?? [];
  const problems =
    issues.reduce((n, e) => n + problemCount(e), 0) +
    lint.length +
    collisions.length;

  const guidesDir = input.guidesPath?.replace(/[\\/]+$/, '');
  // Join with the folder's own separator, so a Windows path stays one style.
  const sep = guidesDir && !guidesDir.includes('/') ? '\\' : '/';
  const cite = (g: string) => `\`${guidesDir ? `${guidesDir}${sep}${g}` : g}\``;

  // Each entity's guides, then the set across the file in first-seen order
  // with the copy spec last.
  const entityGuides = issues.map((e) => [
    ...guidesForEntity(e.type, entityAt(doc, e.type, e.entityIdx)),
    ...referencesFor(e),
  ]);
  const guides: string[] = [];
  for (const g of entityGuides.flat())
    if (g !== COPY_SPEC && !guides.includes(g)) guides.push(g);
  if (entityGuides.some((gs) => gs.includes(COPY_SPEC))) guides.push(COPY_SPEC);

  // A type that shows up in the reply example, so the shape is concrete.
  const exampleType = issues[0]?.type ?? 'spell';
  const edition = editionOf(doc);

  const out: string[] = [];
  out.push(
    `Fix the problems below in my 5etools homebrew file \`${file}\`. I'll paste your reply into my homebrew manager, which merges the JSON back into the file, so follow the reply format exactly. The file is for local use, so don't suggest uploading it or opening a pull request.`,
    '',
    'Do the whole fix in this reply. Don\'t stop to ask first: where a fix is a judgement call, make it and list it under "Review".',
    '',
    '## How to fix',
    '',
    "1. Before fixing an entity, read the guide named under it. The guide is the spec; don't work from memory of the 5etools format. Read each guide once, even when several entities share it.",
    '2. Fix every error. Fix a warning only when the right fix is clear; otherwise list it under "Couldn\'t fix" with why.',
    "3. Change only what a listed problem needs. Keep every other field, its value and the key order as they are, and don't reword text a problem doesn't touch.",
    '4. Keep each entity\'s `name` and `source`, and for class and subclass features its `className`, `classSource` and `level`: the merge matches on them, so changing one adds a second copy instead of replacing the entry. If a fix has to change one, list it under "Review".',
    `5. Never invent a link target. If a tag points at content that doesn't exist, leave it and list it under "Couldn't fix" with what it needs. A link to another brew's content uses that brew's source, and needs the source in \`_meta.dependencies\` under the linked content's property (see ${cite(META_DOC)}).`,
    '6. The merge only adds `_meta.dependencies`. Anything else a file-level problem needs (other `_meta` fields, the file name, formatting) goes under "File changes" for me to make by hand. If a file-level problem is inside an entity, fix it in that entity.',
    '',
    '## Where things are',
    '',
  );
  if (guidesDir)
    out.push(
      `- Conversion guides and reference docs: \`${guidesDir}\`. Each entity below names its guide by full path.`,
    );
  else
    out.push(
      '- Conversion guides and reference docs: in your project, cited by file name.',
    );
  out.push(`- File: \`${input.filePath ?? file}\``);
  const sources = sourcesLine(doc);
  if (sources) out.push(`- Sources: ${sources}`);
  out.push(editionLine(edition));
  const contents = contentsLine(doc);
  if (contents) out.push(`- Contents: ${contents}`);
  if (input.schemaVersion)
    out.push(`- Brew schemas: 5etools-utils v${input.schemaVersion}`);

  out.push(
    '',
    '## Reply with',
    '',
    "1. One JSON block holding every entity you changed, complete, keyed by its array property. Add `_meta` only for `dependencies`, and only when a fix needs one. Leave out entities you didn't change:",
    '',
    '```json',
    '{',
    '  "_meta": { "dependencies": { "spell": ["OtherBrew"] } },',
    `  "${exampleType}": [{ "name": "…", "source": "…" }]`,
    '}',
    '```',
    '',
    '2. Changed: each entity and what you changed, one line each.',
    '3. Review: judgement calls I might want to change. Write "none" if there were none.',
    '4. Couldn\'t fix: anything left, and why. Write "none" if there was nothing.',
    '5. File changes: edits I need to make by hand, exactly. Write "none" if there are none.',
  );

  if (lint.length || collisions.length) {
    out.push('', '## File-level problems', '');
    if (lint.some((i) => i.rule.startsWith('meta.')))
      out.push(`Guide: ${cite(META_DOC)}`, '');
    for (const l of tally([
      ...lint.map((i) => `- ${i.severity} \`${i.rule}\`: ${i.message}`),
      ...collisions.map((c) => `- collision (${c.severity}): ${c.message}`),
    ]))
      out.push(l);
  }

  if (issues.length) out.push('', '## Entities with problems');
  issues.forEach((e, i) => {
    const label = e.name ?? `#${e.entityIdx}`;
    out.push('', `### ${e.type}: ${label} (\`${e.type}[${e.entityIdx}]\`)`, '');
    const gs = entityGuides[i];
    if (gs.length)
      out.push(
        `${gs.length > 1 ? 'Guides' : 'Guide'}: ${gs.map(cite).join(', ')}`,
        '',
      );
    for (const l of tally([
      ...e.schemaErrors.map((m) => `- schema error: ${m.message}`),
      ...e.schemaWarnings.map((m) => `- schema warning: ${m.message}`),
      ...e.linkErrors.map((l) => link('broken link', l)),
      ...e.linkWarnings.map((l) => link('link warning', l)),
    ]))
      out.push(l);
    const entity = entityAt(doc, e.type, e.entityIdx);
    if (entity !== undefined)
      out.push('', '```json', JSON.stringify(entity, null, '\t'), '```');
  });

  return {
    text: out.join('\n') + '\n',
    problems,
    entities: issues.length,
    guides,
  };
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Status line after a copy: what went to the clipboard, or that nothing did. */
export function describeFixPrompt(p: FixPrompt): string {
  if (!p.problems)
    return 'Nothing to fix: no errors, warnings or lint failures.';
  const where = p.entities
    ? ` in ${count(p.entities, 'entity', 'entities')}`
    : '';
  return `Copied a fix prompt: ${count(p.problems, 'problem', 'problems')}${where}. Press "Merge new content" and paste the reply there.`;
}
