/**
 * engine/supersession/types.ts - the shape of a content-supersession mapping.
 *
 * INTENT
 *   `content-replacement.json` is read at runtime by the Content replacement
 *   module's `Renderer.supersede`, which keys everything on `page` + `hash` of the
 *   ORIGINAL entity and resolves the replacement through `replacedBy.uid`.
 *   These types are that file, nothing more. Pure; no I/O.
 */
import type { OverrideRule } from './override-parse.ts';

/** Where a superseded entity now points. `uid` is `"Name|SourceJson"`. */
export interface ReplacedByRef {
  page: string;
  prop: string;
  uid: string;
}

/** One original-to-replacement mapping. */
export interface SupersessionRow {
  /** The original's name, carried because `hash` is lowercased and lossy. */
  displayName: string;
  /** The original's source abbreviation. */
  source: string;
  /** List page the original lives on (`spells.html`). */
  page: string;
  /** 5etools URL hash of the original. */
  hash: string;
  /** The original's content type (`spell`, `baseitem`). */
  prop: string;
  /** One target, or several for a split. The first is the primary. */
  replacedBy: ReplacedByRef[];
  /** Fields we didn't recognise, preserved verbatim on save. */
  extra?: Record<string, unknown>;
}

/** A marker the scan refused to guess at. Authoring-only; never read at runtime. */
export interface ReviewItem {
  /** The replacement's `Name|Source`. */
  replacement: string;
  /** Why it wasn't auto-mapped. */
  reason: string;
  /** The `Name|Source` originals the marker named, where any were parseable. */
  targets: string[];
}

/** A parsed `content-replacement.json`. */
export interface SupersessionDocument {
  rows: SupersessionRow[];
  review: ReviewItem[];
  /** Source override rules; the rows they expand to are in `rows`. */
  overrides: OverrideRule[];
  /** Everything except `supersession` / `overrides` / `_review`, preserved for the round-trip. */
  envelope: Record<string, unknown>;
  /** Rows folded into an existing page+hash on parse. */
  duplicatesMerged: number;
}

/** Identity of an entity as the browse index knows it. */
export interface EntityRef {
  name: string;
  source: string;
  prop: string;
}
