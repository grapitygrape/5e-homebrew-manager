/**
 * engine/audit/guide-enums.ts — the value lists in the guides that come from the schema.
 *
 * WHY THIS EXISTS
 *   Hand-typed value lists drift. The 2026-09-24 review found spell `areaTags`
 *   documenting a `"T"` code the schema has never accepted (and missing `ST`, `MT`,
 *   `E`), race `traitTags` listing `"Darkvision"`, and class `preparedSpellsChange`
 *   suggesting `"longRest"` — all copy-pasteable, all rejected by the validator.
 *
 * HOW IT WORKS
 *   A guide marks a generated list with
 *     <span class="schema-enum" data-enum="NAME">…</span>
 *   where NAME is a key of ENUMS below. The span's contents are the real values,
 *   rendered from the schema, so the list reads correctly in the app and in raw
 *   markdown alike. `regenerateGuideLists` re-renders every span in one guide.
 *   `npm run guides:enums` and Deploy Site's Review both use it.
 *
 * Pure: the caller loads the brew schemas (a SchemaMap keyed by posix path).
 */
import type { SchemaMap } from './schema.ts';

type Json = Record<string, unknown>;

// --- posix paths (schema $refs are always posix) ------------------------------

const dirname = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/')));
function joinPosix(dir: string, rel: string): string {
  const out: string[] = [];
  for (const seg of `${dir}/${rel}`.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

// --- schema lookup ------------------------------------------------------------

/** Resolve `file#/json/pointer`, following local `$ref`s. */
function at(schemas: SchemaMap, ref: string, from = ''): [Json, string] {
  const [f, frag = ''] = ref.split('#');
  const file = f ? joinPosix(dirname(from), f) : from;
  let node: unknown = schemas[file];
  for (const seg of frag.split('/').filter(Boolean))
    node = (node as Json | undefined)?.[seg];
  if (!node) throw new Error(`schema pointer not found: ${ref}`);
  return follow(schemas, node as Json, file);
}
function follow(schemas: SchemaMap, node: Json, file: string): [Json, string] {
  const r = node.$ref;
  return typeof r === 'string' && !r.startsWith('http')
    ? at(schemas, r, file)
    : [node, file];
}

/** Every string enum/const/example value reachable without descending into properties. */
function values(
  schemas: SchemaMap,
  node: Json,
  file: string,
  out: string[] = [],
): string[] {
  [node, file] = follow(schemas, node, file);
  const push = (v: unknown) =>
    typeof v === 'string' && !out.includes(v) && out.push(v);
  (node.enum as unknown[] | undefined)?.forEach(push);
  push(node.const);
  for (const k of ['anyOf', 'oneOf', 'allOf'])
    for (const s of (node[k] as Json[] | undefined) ?? [])
      values(schemas, s, file, out);
  if (node.items) values(schemas, node.items as Json, file, out);
  if (!out.length) (node.examples as unknown[] | undefined)?.forEach(push);
  return out;
}

/** "- CODE: Label" lines from a schema description, when the schema documents them. */
function labelsFrom(node: Json): Record<string, string> {
  const desc = typeof node.description === 'string' ? node.description : '';
  return Object.fromEntries(
    [...desc.matchAll(/^- ([^:\n]+): (.+)$/gm)].map((m) => [
      m[1].trim(),
      m[2].trim(),
    ]),
  );
}

// --- the registry -----------------------------------------------------------

interface EnumDef {
  /** Schema pointer to the enum (or to an object whose property names are the values). */
  ref: string;
  /** Use the object's property names instead of enum values. */
  keys?: boolean;
  /** Values to leave out (meta keys such as `any` / `choose`). */
  exclude?: (v: string, schemas: SchemaMap) => boolean;
  /** Wrap values in quotes — true for string values, false for object keys. */
  quote: boolean;
  /** Code → label, rendered as `"C" Cube`. `true` reads them from the schema description. */
  labels?: Record<string, string> | true;
}

const META_KEY = (v: string) => v === 'choose' || v.startsWith('any');

export const ENUMS: Record<string, EnumDef> = {
  skillNames: {
    ref: 'util.json#/$defs/skillProficiencies/items',
    keys: true,
    exclude: META_KEY,
    quote: false,
  },
  languageNames: {
    ref: 'util.json#/$defs/languageProficiencies/items',
    keys: true,
    exclude: META_KEY,
    quote: false,
  },
  toolNames: {
    ref: 'util.json#/$defs/toolProficiencies/items',
    keys: true,
    exclude: META_KEY,
    quote: false,
  },
  expertiseTools: {
    ref: 'util.json#/$defs/expertise/items',
    keys: true,
    exclude: (v, schemas) => META_KEY(v) || skillKeys(schemas).includes(v),
    quote: false,
  },
  damageTypes: { ref: 'util.json#/$defs/dataDamageType', quote: true },
  conditions: { ref: 'util.json#/$defs/tagsConditions', quote: true },
  savingThrows: { ref: 'util.json#/$defs/tagsSavingThrow', quote: true },
  abilityAbbreviations: {
    ref: 'util.json#/$defs/abilityScoreAbbreviation',
    quote: true,
  },
  sizes: {
    ref: 'util.json#/$defs/size',
    quote: true,
    labels: {
      F: 'Fine',
      D: 'Diminutive',
      T: 'Tiny',
      S: 'Small',
      M: 'Medium',
      L: 'Large',
      H: 'Huge',
      G: 'Gargantuan',
      C: 'Colossal',
      V: 'Varies',
    },
  },
  itemRarity: { ref: 'items-shared.json#/$defs/itemRarity', quote: true },
  rarity: { ref: 'util.json#/$defs/rarity', quote: true },
  itemRecharge: { ref: 'items-shared.json#/$defs/itemRecharge', quote: true },
  itemMiscTags: {
    ref: 'items-shared.json#/$defs/itemMiscTags/items',
    quote: true,
    labels: true,
  },
  foundryItemType: {
    ref: 'items.json#/$defs/_item/properties/foundryType',
    quote: true,
  },
  spellAreaTags: {
    ref: 'spells/spells.json#/$defs/spellData/properties/areaTags',
    quote: true,
    labels: true,
  },
  spellMiscTags: {
    ref: 'spells/spells.json#/$defs/spellData/properties/miscTags',
    quote: true,
    labels: true,
  },
  raceTraitTags: { ref: 'races.json#/$defs/traitTag', quote: true },
  // Examples in the brew schema (homebrew may add its own); a closed enum on the site.
  storylines: {
    ref: 'adventures.json#/properties/adventure/items/properties/storyline',
    quote: true,
  },
  preparedSpellsChange: {
    ref: 'class/class.json#/$defs/preparedSpellsChange',
    quote: true,
  },
};

function skillKeys(schemas: SchemaMap): string[] {
  const [n] = at(schemas, ENUMS.skillNames.ref);
  return Object.keys((n.properties as Json) ?? {}).filter((v) => !META_KEY(v));
}

/** One list's span body, rendered from the schema. Throws if its pointer is gone. */
export function renderEnum(schemas: SchemaMap, name: string): string {
  const def = ENUMS[name];
  const [node, file] = at(schemas, def.ref);
  let vals = def.keys
    ? Object.keys((node.properties as Json) ?? {})
    : values(schemas, node, file);
  if (def.exclude) vals = vals.filter((v) => !def.exclude!(v, schemas));
  const labels = def.labels === true ? labelsFrom(node) : (def.labels ?? {});
  const hasLabels = Object.keys(labels).length > 0;
  return vals
    .map((v) => {
      const code = `<code>${def.quote ? `"${v}"` : v}</code>`;
      return labels[v] ? `${code} ${labels[v]}` : code;
    })
    .join(hasLabels ? ' · ' : ', ');
}

// --- one guide ------------------------------------------------------------------

const SPAN =
  /<span class="schema-enum" data-enum="([A-Za-z]+)">([\s\S]*?)<\/span>/g;
const LEGACY = /<schema-enum type="([A-Za-z]+)">[^<]*<\/schema-enum>/g;

export interface GuideListsResult {
  /** The guide with every list it could render brought up to date. */
  next: string;
  /** One line per stale, legacy, unknown or unrenderable list. */
  problems: string[];
  /** Generated lists in the guide. */
  total: number;
  /** Lists that can't be fixed by regenerating (unknown name, pointer gone). */
  unknown: number;
}

export function regenerateGuideLists(
  md: string,
  schemas: SchemaMap,
): GuideListsResult {
  const problems: string[] = [];
  let total = 0;
  let unknown = 0;
  const tryRender = (name: string): string | null => {
    try {
      return renderEnum(schemas, name);
    } catch (e) {
      unknown++;
      problems.push(`"${name}": ${(e as Error).message}`);
      return null;
    }
  };
  const next = md
    .replace(LEGACY, (m, name: string) => {
      problems.push(
        `legacy <schema-enum type="${name}"> (renders as placeholder text)`,
      );
      const fresh = ENUMS[name] ? tryRender(name) : null;
      return fresh === null
        ? m
        : `<span class="schema-enum" data-enum="${name}">${fresh}</span>`;
    })
    .replace(SPAN, (m, name: string, body: string) => {
      total++;
      if (!ENUMS[name]) {
        unknown++;
        problems.push(`unknown data-enum "${name}"`);
        return m;
      }
      const fresh = tryRender(name);
      if (fresh === null) return m;
      if (fresh !== body) problems.push(`stale "${name}"`);
      return `<span class="schema-enum" data-enum="${name}">${fresh}</span>`;
    });
  return { next, problems, total, unknown };
}
