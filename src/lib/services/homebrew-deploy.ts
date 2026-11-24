/**
 * Read, save, and deploy homebrew JSON files from the working folder.
 *
 * - Raw text read/save (for the Parser) preserves the file's own formatting
 *   (5etools brews are tab-indented) and refuses invalid JSON.
 * - Deploy copies one or every brew into each configured homebrew deploy
 *   folder (Foundry, a live site's homebrew/, …), overwriting.
 *
 * FOUNDRY'S index.json
 *   Neptunium's "Use index.json for Local Homebrew" loads only what the
 *   folder's index.json lists, and players without file browser rights can't
 *   load anything without one. So each deploy into a folder under Foundry's
 *   Data folder rewrites its index from the brews in it. content-blocklist.json
 *   is still copied there for reference but stays out of the index: Neptunium
 *   would only merge it in (never remove), and Deploy on the Blocklist page
 *   sets the world's blocklist directly. A site's homebrew/ index lists files
 *   the site should load and is managed elsewhere (homebrew-library.ts).
 */
import { fs, path } from '$lib/fs';
import { IGNORED_HOMEBREW, type AppSettings } from '$lib/data';
import { foundryDataRelative } from '$lib/engine/foundry/neptunium-settings.ts';
import { configProvider } from './config';
import { priceDocument } from '$lib/engine/item-prices.ts';
import type { ItemPrice } from '$lib/engine/item-prices.ts';
import { loadItemPrices } from './item-prices-service';

export interface DeployDestination {
  label: string;
  path: string;
}

export interface DeployResult {
  copied: string[];
  errors: { label: string; path: string; message: string }[];
}

/** A configured local folder path, or null if unset / an http(s) URL. */
export function localDeployPath(
  value: string | undefined | null,
): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return null;
  return v;
}

/** Destinations the Files page can deploy to: each local homebrew deploy folder. */
export function deployTargets(
  app: Pick<AppSettings, 'homebrewDeployFolders'>,
): DeployDestination[] {
  return app.homebrewDeployFolders
    .map(localDeployPath)
    .filter((p): p is string => p !== null)
    .map((p) => ({ label: p, path: p }));
}

/** Resolve a possibly-relative local folder against the config root. */
export function resolveLocalDir(
  value: string,
  rootDir: string = configProvider().root(),
): string {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

/** Bare `.json` filename only — no directories, no traversal. */
export function safeHomebrewFilename(file: string): string {
  const name = (file ?? '').trim();
  if (!name || name !== path.basename(name)) {
    throw new Error('Invalid filename');
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error('Invalid filename');
  }
  if (!name.toLowerCase().endsWith('.json')) {
    throw new Error('Invalid filename');
  }
  return name;
}

// --- raw text read/save (Parser) --------------------------------------------

function workingBrewPath(file: string): string {
  const name = safeHomebrewFilename(file);
  if (IGNORED_HOMEBREW.has(name.toLowerCase()))
    throw new Error('Invalid filename');
  const hb = configProvider().effectiveConfig().homebrew;
  if (!hb.path) throw new Error('Homebrew source is not a local folder');
  return path.join(resolveLocalDir(hb.path), name);
}

/** One working-folder brew's text, exactly as it is on disk. */
export async function readHomebrewText(file: string): Promise<string> {
  const target = workingBrewPath(file);
  try {
    return await fs().readText(target);
  } catch {
    throw new Error(`Homebrew file not found: ${file}`);
  }
}

/**
 * Overwrite an existing working-folder brew with `text`. Refuses text that
 * isn't a JSON object, so a half-typed edit can't replace a good file.
 */
export async function saveHomebrewText(
  file: string,
  text: string,
): Promise<{ path: string }> {
  const target = workingBrewPath(file);
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Not saved: the text is not valid JSON (${(e as Error).message})`,
    );
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc))
    throw new Error('Not saved: a homebrew file must be a JSON object');
  try {
    await fs().stat(target);
  } catch {
    throw new Error(`Homebrew file not found: ${file}`);
  }
  await fs().writeText(target, text);
  return { path: target };
}

// --- deploy -----------------------------------------------------------------

export async function deployHomebrewFile(opts: {
  sourceDir: string;
  file: string;
  destinations: DeployDestination[];
  /** Rewrite Foundry folders' index.json after the copy (default true). */
  indexFoundry?: boolean;
  /** Shops > Prices rows; matching items are priced in the copies, never the source. */
  prices?: ItemPrice[];
}): Promise<DeployResult> {
  const file = safeHomebrewFilename(opts.file);
  const src = path.join(opts.sourceDir, file);
  try {
    await fs().stat(src);
  } catch {
    throw new Error(`Homebrew file not found: ${file}`);
  }
  const priced = opts.prices?.length
    ? await pricedText(src, opts.prices)
    : null;
  const copied: string[] = [];
  const errors: DeployResult['errors'] = [];
  for (const dest of opts.destinations) {
    try {
      const dirStat = await fs().stat(dest.path);
      if (!dirStat.isDirectory) throw new Error('Not a folder');
      const to = path.join(dest.path, file);
      if (priced) await fs().writeText(to, priced);
      else await fs().copyFile(src, to);
      if (opts.indexFoundry !== false) await writeFoundryIndex(dest.path);
      copied.push(dest.path);
    } catch (e) {
      errors.push({
        label: dest.label,
        path: dest.path,
        message: (e as Error).message,
      });
    }
  }
  return { copied, errors };
}

/**
 * The brew with prices applied, or null when nothing in it matches (then the
 * file is copied byte for byte). A brew that isn't valid JSON is copied as is:
 * pricing is never a reason to fail a deploy.
 */
async function pricedText(
  src: string,
  prices: ItemPrice[],
): Promise<string | null> {
  let doc: unknown;
  try {
    doc = JSON.parse((await fs().readText(src)).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  if (!priceDocument(doc as Record<string, unknown>, prices)) return null;
  return JSON.stringify(doc, null, '\t') + '\n';
}

/** Settings' deploy destinations, resolved to absolute folders. */
export function configuredDeployTargets(): DeployDestination[] {
  return deployTargets(configProvider().effectiveAppSettings()).map((d) => ({
    ...d,
    path: resolveLocalDir(d.path),
  }));
}

async function deploySetup(): Promise<{
  sourceDir: string;
  destinations: DeployDestination[];
  prices: ItemPrice[];
}> {
  const destinations = configuredDeployTargets();
  if (!destinations.length)
    throw new Error('No deploy destinations configured');
  const hb = configProvider().effectiveConfig().homebrew;
  if (!hb.path) throw new Error('Homebrew source is not a local folder');
  // A broken price file shouldn't block a deploy; the brews just go unpriced.
  const prices = await loadItemPrices().then(
    (l) => l.rows,
    () => [],
  );
  return { sourceDir: resolveLocalDir(hb.path), destinations, prices };
}

/** Deploy one file from the working homebrew folder to Settings' destinations. */
export async function deployFromHomebrew(file: string): Promise<DeployResult> {
  return deployHomebrewFile({ ...(await deploySetup()), file });
}

export interface DeployAllResult {
  files: number;
  /** Destinations that took every file. */
  copied: string[];
  errors: { label: string; path: string; file: string; message: string }[];
}

/** Deploy every brew in the working homebrew folder, one file at a time. */
export async function deployAllFromHomebrew(): Promise<DeployAllResult> {
  const setup = await deploySetup();
  const files = (await fs().readDir(setup.sourceDir))
    .filter(
      (e) =>
        e.isFile &&
        e.name.endsWith('.json') &&
        !IGNORED_HOMEBREW.has(e.name.toLowerCase()),
    )
    .map((e) => e.name);
  const errors: DeployAllResult['errors'] = [];
  for (const file of files) {
    const result = await deployHomebrewFile({
      ...setup,
      file,
      indexFoundry: false,
    });
    for (const e of result.errors) errors.push({ ...e, file });
  }
  // Once per folder rather than once per file.
  for (const dest of setup.destinations) {
    try {
      await writeFoundryIndex(dest.path);
    } catch (e) {
      errors.push({
        label: dest.label,
        path: dest.path,
        file: 'index.json',
        message: (e as Error).message,
      });
    }
  }
  const failed = new Set(errors.map((e) => e.path));
  return {
    files: files.length,
    copied: setup.destinations.map((d) => d.path).filter((p) => !failed.has(p)),
    errors,
  };
}

/**
 * The index.json a Foundry homebrew folder should hold: every brew in it,
 * sorted, keeping any other keys the old index had. Null when it already
 * matches, so an unchanged folder isn't rewritten.
 */
export function foundryIndex(
  existing: unknown,
  files: string[],
): Record<string, unknown> | null {
  const toImport = files
    .filter(
      (f) =>
        f.toLowerCase().endsWith('.json') &&
        !IGNORED_HOMEBREW.has(f.toLowerCase()),
    )
    .sort((a, b) => a.localeCompare(b));
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  if (JSON.stringify(base.toImport) === JSON.stringify(toImport)) return null;
  return { ...base, toImport };
}

/** Rewrite index.json in a folder under Foundry's Data folder; others are left alone. */
export async function writeFoundryIndex(dir: string): Promise<void> {
  if (foundryDataRelative(dir) === null) return;
  const files = (await fs().readDir(dir))
    .filter((e) => e.isFile)
    .map((e) => e.name);
  const target = path.join(dir, 'index.json');
  let existing: unknown = null;
  try {
    existing = JSON.parse(await fs().readText(target));
  } catch {
    // Missing or unreadable: write a fresh one.
  }
  const next = foundryIndex(existing, files);
  // Tabs, like the site's own homebrew/index.json.
  if (next)
    await fs().writeText(target, JSON.stringify(next, null, '\t') + '\n');
}
