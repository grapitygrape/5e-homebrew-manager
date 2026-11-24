/**
 * engine/audit/convert-prompt.ts — a prompt that tells a model how to convert
 * pasted text into entries for a brew file.
 *
 * INTENT
 *   The app doesn't convert anything itself. It assembles what a model needs to
 *   convert: where the guides, data and homebrew live, which guide covers which
 *   type, the target file's sources and edition, the rules that are easy to get
 *   wrong, and a reply format that brew-merge.ts can merge back. The model
 *   always converts first: unclear points become its own calls, listed for
 *   review after the JSON, and source defects are fixed and listed rather than
 *   left for me to decide. A file with no source gets UNKNOWN. The reply also
 *   asks for "Guide gaps", so each conversion shows where the guides fall
 *   short.
 *
 * REUSE NOTES
 *   - Pure. prompt-client.ts gathers the folder paths and schema
 *     version.
 *   - The guide list comes from GUIDE_MAP, so a new guide shows up here
 *     without a code change.
 *   - STANDARD_HANDLING is the house answer to defects that keep coming up.
 *     When a conversion's Review or Guide gaps raises a new recurring one, add
 *     it there (or to the type's guide, if it's specific to one type).
 */
import { GUIDE_MAP } from './guide-map.ts';
import { contentsLine, editionOf, type Edition } from './fix-prompt.ts';
import { isObj, type Obj } from '../../util.ts';

export interface ConvertPromptPaths {
  guides?: string;
  data?: string;
  homebrew?: string;
  schema?: string;
}

export interface ConvertPromptInput {
  /** The text to convert, as pasted. */
  source: string;
  file: string;
  /** Where the file lives on disk, when known. */
  filePath?: string;
  /** The brew being added to; null when the editor is empty. */
  doc: Record<string, unknown> | null;
  paths: ConvertPromptPaths;
  /** 5etools-utils version the schemas came from, when known. */
  schemaVersion?: string | null;
}

/** The placeholder source for a file that has none yet. */
export const UNKNOWN_SOURCE = 'UNKNOWN';

/** Reference docs in the guides folder that conversions lean on. */
const REFERENCE_DOCS: [string, string][] = [
  [
    'meta.md',
    '`_meta`, including `dependencies` for content that links to or copies another brew',
  ],
  ['Spec_Copy.md', '`_copy` and `_mod`, for an entry based on an existing one'],
  ['prerequisite-reference.md', 'the `prerequisite` field'],
  [
    'additionalspells-reference.md',
    '`additionalSpells`, for spells granted by a feat, ancestry, subclass and so on',
  ],
  ['item-properties-reference.md', 'item property and type codes'],
];

/**
 * The standard handling for defects that keep turning up in source text. Each
 * one the model applies is listed under Fixes, so I can still see it.
 */
const STANDARD_HANDLING: string[] = [
  'A save with no DC where a parent rule already sets it (Channel Divinity, or a class that says its features use its spell save DC): not a defect. Leave it as written.',
  'A save with no DC anywhere else in a class or subclass feature: add "against your spell save DC". In a statblock: 8 + proficiency bonus + the ability modifier.',
  '"A number of times equal to your <ability> modifier": add "(minimum of once)".',
  'Conflicting numbers: use the one in the table, else the more specific statement. Also list it under "Review".',
  'Scaling with no threshold: use the class\'s usual breakpoints (5th, 11th and 17th level for cantrip-style scaling). Also list it under "Review".',
  'A gap in a numbered list: keep the numbering as written, since there is nothing to fill it with. List it under "Review".',
  'Fixed damage with no dice ("takes 1 lightning damage"): plain text, no tag.',
  "A name spelled two ways: use the form in the feature's own heading, everywhere.",
  'Names: keep the source\'s names for features and options, even where official content names the same thing differently (a domain whose first feature is "Domain Spells", not the domain\'s name).',
  'Wording that reads oddly but isn\'t wrong: keep it. List it under "Review" only if it might be a mistake.',
];

/** One line per array property: its labels and every guide that covers it. */
function guideLines(): string[] {
  const byProp = new Map<string, { labels: string[]; guides: string[] }>();
  for (const [guide, v] of Object.entries(GUIDE_MAP)) {
    const row = byProp.get(v.arrayProp) ?? { labels: [], guides: [] };
    row.labels.push(v.label);
    row.guides.push(guide);
    byProp.set(v.arrayProp, row);
  }
  return [...byProp].map(
    ([prop, { labels, guides }]) =>
      `- \`${prop}\` (${labels.join(', ')}): ${guides.map((g) => `\`${g}\``).join(', ')}`,
  );
}

function sourceList(doc: Obj | null): { json: string; full?: string }[] {
  const meta = doc?._meta;
  const sources =
    isObj(meta) && Array.isArray(meta.sources) ? meta.sources : [];
  return sources.flatMap((s) =>
    isObj(s) && typeof s.json === 'string'
      ? [
          {
            json: s.json,
            full: typeof s.full === 'string' ? s.full : undefined,
          },
        ]
      : [],
  );
}

/** Which source entries take: the file's one, the best fit of several, or UNKNOWN. */
function sourceLine(sources: { json: string; full?: string }[]): string {
  const list = sources
    .map((s) => `\`${s.json}\`${s.full ? ` (${s.full})` : ''}`)
    .join(', ');
  if (sources.length === 1) return `- Source: ${list}. Every entry uses it.`;
  if (sources.length)
    return `- Sources: ${list}. Use the one the text belongs to; if that isn't clear, use the first and list it under "Review".`;
  return `- Source: none yet. Use \`"${UNKNOWN_SOURCE}"\` for every entry, and wherever a tag or reference names this content's source. I'll rename it when the file gets a source.`;
}

/** Tag sourcing and casing for the file's edition, or how to pick one. */
function editionLines(edition: Edition | null): string[] {
  if (edition === 'one')
    return [
      '- This file uses the 2024 rules (`"edition": "one"`). Tag official content with its 2024 source: `{@spell fireball|xphb}`, `{@item dagger|xphb}`.',
      '- Casing follows the 2024 books: conditions and damage types are capitalized in running text ("the Poisoned condition", "Fire damage").',
    ];
  if (edition === 'classic')
    return [
      '- This file uses the 2014 rules (`"edition": "classic"`). Tag official content with its 2014 source: `{@spell fireball}` (PHB is the default), `{@item dagger|phb}`. A 2024 source (`xphb`, `xdmg`, `xmm`) anywhere is an error.',
      '- Casing follows the 2014 books: conditions and damage types are lowercase in running text ("the poisoned condition", "fire damage").',
    ];
  return [
    '- This file has no edition yet. Decide it from the text: 2024 rules capitalize conditions and damage types ("the Poisoned condition", "Fire damage") and use terms like species, Weapon Mastery and the Magic action. Otherwise use classic (2014). Put your choice in the reply\'s `_meta.edition` and list it under "Review".',
    '- Then tag and case to match: 2024 tags official content with its 2024 source (`{@spell fireball|xphb}`) and capitalizes conditions and damage types; 2014 tags with `{@spell fireball}` and `{@item dagger|phb}` and lowercases them.',
  ];
}

/** A fence longer than any backtick run in the text, so the text can't close it. */
function fenceFor(text: string): string {
  const longest = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((m) => m[0].length),
  );
  return '`'.repeat(Math.max(3, longest + 1));
}

export function buildConvertPrompt(input: ConvertPromptInput): string {
  const { doc, paths, file } = input;
  const sources = sourceList(doc);
  const edition = editionOf(doc);
  const out: string[] = [];

  out.push(
    `Convert the source text at the end into 5etools homebrew JSON for my file \`${file}\`. I'll paste your reply into my homebrew manager, which merges the JSON into the file, so follow the reply format exactly.`,
    '',
    'Do the whole conversion in this reply. Don\'t stop to ask first: where something is unclear, make the best call, carry on, and list the call under "Review" at the end. A reply without the JSON is a failed reply. These instructions override any conversion skill or habit that says to ask before converting, or to leave defects for the author.',
    '',
    '## How to convert',
    '',
    '1. Decide which homebrew type each part of the text is, using "Guides by type" below. If a part could be more than one type (a feat or an optional feature, say), pick one and list it under "Review".',
    "2. Read the whole conversion guide for each type before writing its JSON. The guide is the spec; don't work from memory of the 5etools format.",
    '3. Set every entry\'s `source` as "Target file" says.',
    '4. Before converting something, look for it in the homebrew folder and the 5etools data. If the text repeats or extends content that is already converted, reuse that JSON and its tags rather than retagging, or build on it with `_copy` (see `Spec_Copy.md`).',
    '5. Tag the text as you go (see "Tags"). When a reference matches more than one brew, link the original (the earliest or most complete one). When it matches nothing you can find, leave it as plain text. List either case under "Review".',
    '6. Fix defects in the source as you convert, and list each one under "Fixes": typos, punctuation, stray spaces, curly quotes, casing (see "Tags"), and the cases under "Standard handling".',
    '7. Keep every rule and all flavour text; flavour that the guide puts in a fluff array goes there. Drop only page furniture: page numbers, running headers and footers, playtest banners, complexity ratings.',
    '8. The manager checks the schema and every link (against all the brews in the homebrew folder) after the merge. Run your own checks if you have them, but don\'t build a temporary file just for that. A link you couldn\'t verify goes under "Review".',
    '',
    '## Standard handling',
    '',
    ...STANDARD_HANDLING.map((s) => `- ${s}`),
    '',
    '## Where things are',
    '',
  );
  if (paths.guides) {
    out.push(
      `- Conversion guides: \`${paths.guides}\`, one per type (see "Guides by type").`,
    );
    out.push('- Reference docs in the same folder:');
    for (const [name, what] of REFERENCE_DOCS)
      out.push(`  - \`${name}\`: ${what}`);
  }
  if (paths.data) out.push(`- 5etools data: \`${paths.data}\``);
  if (paths.homebrew) out.push(`- Homebrew folder: \`${paths.homebrew}\``);
  if (paths.schema)
    out.push(
      `- Brew schemas: \`${paths.schema}\`${input.schemaVersion ? ` (5etools-utils v${input.schemaVersion})` : ''}`,
    );
  out.push(
    '',
    'If you can\'t open these folders, convert anyway from these instructions and the 5etools format, and list the guides you couldn\'t read under "Review".',
    '',
    '## Guides by type',
    '',
    ...guideLines(),
    '',
    'A type with no guide: follow its schema and an existing entry of that type.',
    '',
    '## Tags',
    '',
    '- Every damage roll is `{@damage 2d6}`, including in a saving throw sentence ("takes {@damage 3d6} fire damage on a failed save"). `{@dice 2d10}` is only for rolls that are not damage.',
    '- DC: `{@dc 15}`. Attack bonus: `{@hit 7}`.',
    '- Conditions, creatures, skills, senses, actions: `{@condition frightened}`, `{@creature goblin}`, `{@skill Perception}`, `{@sense darkvision}`, `{@action Dash}`.',
    '- Emphasis: `{@i text}`, `{@b text}`.',
    '- The pattern is `{@tag name|source|display text}`. A tag that names content must match a real entry, or the link is dead even though the JSON is valid.',
    '- A link to another brew\'s content uses that brew\'s source, and the reply\'s `_meta.dependencies` lists the source under the linked content\'s property: `{@spell arcane ablation|KT-CLL}` needs `"spell": ["KT-CLL"]` (see `meta.md`). A `_copy` from another brew needs the same.',
    ...editionLines(edition),
  );

  out.push('', '## Target file', '', `- File: \`${file}\``);
  if (input.filePath) out.push(`- Path: \`${input.filePath}\``);
  out.push(sourceLine(sources));
  out.push(`- Edition: ${edition ?? 'not set'}`);
  const contents = doc ? contentsLine(doc) : '';
  out.push(`- Contents: ${contents || 'empty'}`);
  const metaKeys = edition ? '`dependencies`' : '`dependencies` and `edition`';
  out.push(
    '',
    'An entry with the same name and source as one already in the file replaces it when merged. Do that only on purpose.',
    '',
    '## Reply with',
    '',
    `1. One JSON block holding every converted entry, keyed by homebrew property. Add \`_meta\` only for ${metaKeys}, and only when there's something to put there. No other keys:`,
    '',
    '```json',
    '{',
    `  "_meta": { "dependencies": { "spell": ["KT-CLL"] }${edition ? '' : ', "edition": "one"'} },`,
    '  "subclass": [{ "name": "…", "source": "…" }],',
    '  "subclassFeature": [{ "name": "…", "source": "…" }]',
    '}',
    '```',
    '',
    "2. Converted: each entry's property and name, and the guide you followed.",
    '3. Fixes: each defect you fixed, quoting the original and saying what you changed. Write "none" if there were none.',
    '4. Review: each call I might want to change (the source, the edition, a link target, a type, dropped text, a mechanical gap you filled), with the alternatives. Write "none" if there were none.',
    '5. Guide gaps: anything the guides and "Standard handling" didn\'t cover that you had to decide yourself, and which guide it belongs in. Write "none" if there were none.',
    '',
    '## Source text',
    '',
  );
  const fence = fenceFor(input.source);
  out.push(fence + 'text', input.source.trim(), fence);
  return out.join('\n') + '\n';
}
