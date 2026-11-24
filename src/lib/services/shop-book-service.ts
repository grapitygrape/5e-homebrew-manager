/**
 * lib/services/shop-book-service.ts — export shops as a 5etools homebrew book.
 *
 * INTENT
 *   One way to show shops to players on the site: a brew book with one chapter
 *   per shop, which the site renders with its own item hovers. Not wired to a
 *   page yet; see docs/SHOPS-PLAN.md, Phase 4. Resolves each shop through
 *   shop-service, then hands the rows to the pure `buildShopBook`.
 *
 * REUSE NOTES
 *   - Output is validated against schema/brew/homebrew.json; if that schema
 *     gains required fields, `buildShopBook` is the single place to fix.
 *   - Ordering follows the caller's file list so a re-export diffs cleanly.
 */
import { buildShopBook } from '$lib/engine';
import type {
  ShopBookChapter,
  ShopBookDoc,
  ShopBookOptions,
} from '$lib/engine';
import { configProvider } from './config';
import { listShops, openShop } from './shop-service';

export interface ShopBookRequest extends Pick<
  ShopBookOptions,
  'groupByType' | 'includeUnresolved' | 'includeTotals' | 'edition'
> {
  /** Shop file names to export. Empty or omitted exports every shop. */
  files?: string[];
  source?: string;
  name?: string;
  author?: string;
}

export interface ShopBookResult {
  doc: ShopBookDoc;
  /** Suggested download filename. */
  fileName: string;
  /** Per-chapter counts, so the UI can report what was (and wasn't) included. */
  chapters: Array<{
    name: string;
    file: string;
    found: number;
    missing: number;
  }>;
}

export async function buildShopBookExport(
  req: ShopBookRequest = {},
): Promise<ShopBookResult> {
  const app = configProvider().effectiveAppSettings();
  const files = req.files?.length
    ? req.files
    : (await listShops()).shops.filter((s) => !s.error).map((s) => s.file);

  const chapters: ShopBookChapter[] = [];
  const summary: ShopBookResult['chapters'] = [];
  for (const file of files) {
    const opened = await openShop(file);
    chapters.push({ name: opened.shop.name, rows: opened.rows, totalCp: opened.totalCp });
    summary.push({
      name: opened.shop.name,
      file,
      found: opened.foundCount,
      missing: opened.missingCount,
    });
  }

  const source = req.source?.trim() || app.shopBookSource;
  const name = req.name?.trim() || app.shopBookName;
  const now = Math.floor(Date.now() / 1000);

  const doc = buildShopBook(chapters, {
    source,
    name,
    full: name,
    author: req.author,
    published: new Date(now * 1000).toISOString().slice(0, 10),
    groupByType: req.groupByType,
    includeUnresolved: req.includeUnresolved,
    includeTotals: req.includeTotals,
    edition: req.edition,
    now,
  });

  return { doc, fileName: `${source}.json`, chapters: summary };
}
