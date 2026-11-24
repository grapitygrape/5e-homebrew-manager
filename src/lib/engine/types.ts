/**
 * engine/types.ts — shared types for the homebrew-manager engine.
 *
 * INTENT
 *   One vocabulary for 5etools homebrew data, reused by every engine module and
 *   by the UI. 5etools content is famously heterogeneous, so `Entity` stays
 *   open (index signature) while still naming the fields the engine actually
 *   reads. Keep this file dependency-free — it's the root of the import graph.
 *
 * REUSE NOTES
 *   - `Entity` is deliberately loose. Narrow with the per-type helpers in
 *     translate.ts rather than tightening this and fighting real-world data.
 *   - `_`-prefixed fields are runtime annotations the engine adds (not schema).
 */

/** Entity types the renderer (translate.ts) knows how to lay out. */
export type RenderableType =
  | 'item'
  | 'spell'
  | 'feat'
  | 'background'
  | 'race'
  | 'class'
  | 'optionalfeature'
  | 'condition'
  | 'status'
  | 'action';

/** The array key an entity lives under inside a 5etools homebrew file. */
export type ArrayProp =
  | 'item'
  | 'spell'
  | 'feat'
  | 'background'
  | 'race'
  | 'subrace'
  | 'optionalfeature'
  | 'action'
  | 'condition'
  | 'status'
  | 'class'
  | 'subclass'
  | 'classFeature'
  | 'subclassFeature'
  | 'magicvariant'
  | 'baseitem'
  | 'itemGroup'
  | 'monster'
  | 'legendaryGroup'
  | 'vehicle'
  | 'vehicleUpgrade'
  | 'trap'
  | 'hazard'
  | 'deity'
  | 'table'
  | 'variantrule'
  | 'monsterfeatures'
  | 'itemFluff'
  | 'monsterFluff'
  | 'classFluff'
  | 'subclassFluff'
  | 'featFluff'
  | 'spellFluff'
  | 'backgroundFluff'
  | 'conditionFluff'
  | 'raceFluff'
  | 'book'
  | 'bookData'
  | 'adventure'
  | 'reward'
  | 'deck';

/** A 5etools "entries" node: string, number, nested object, or array thereof. */
export type Entry = string | number | EntryObject | Entry[];

export interface EntryObject {
  type?: string;
  name?: string;
  entries?: Entry[];
  items?: Entry[] | EntryItem[];
  [key: string]: unknown;
}

export interface EntryItem {
  type?: string;
  name?: string;
  entry?: Entry;
  entries?: Entry[];
  [key: string]: unknown;
}

/** A single homebrew/official record. Open by design. */
export interface Entity {
  name?: string;
  source?: string;
  page?: number;
  entries?: Entry[];
  _copy?: CopyDirective;
  /** Runtime annotation: true when loaded from a homebrew file. */
  _isHomebrew?: boolean;
  /** Runtime annotation: the homebrew filename this came from. */
  _homebrewFile?: string;
  /** Runtime annotation: true when produced by resolving a `_copy`. */
  _isCopy?: boolean;
  /** Runtime annotation: rendered output attached by translate.ts. */
  _display?: EntityDisplay;
  [key: string]: unknown;
}

/** Rendered output for an entity (HTML sheet + plain summary + flat props). */
export interface EntityDisplay {
  html: string;
  textSummary: string;
  properties: Record<string, unknown>;
}

/** 5etools `_copy` block — copy a base record and modify it. See guides/Spec_Copy.md. */
export interface CopyDirective {
  name?: string;
  source?: string;
  className?: string;
  classSource?: string;
  level?: number;
  shortName?: string;
  subclassShortName?: string;
  subclassSource?: string;
  subSource?: string;
  _mod?: Record<string, CopyMod | CopyMod[] | 'remove'>;
  _preserve?: Record<string, boolean>;
  _templates?: unknown[];
  [key: string]: unknown;
}

export interface CopyMod {
  mode?: string;
  [key: string]: unknown;
}

/** A loaded blocklist file's lookup, keyed `name__category__source` (with `*` wildcards). */
export type BlocklistLookup = Record<string, true>;

/** Result of validating one entity against a guide's schema surface. */
export interface ValidationResult {
  /** HTML-bearing: messages embed `<code>` tags. */
  errors: string[];
  warnings: string[];
}
