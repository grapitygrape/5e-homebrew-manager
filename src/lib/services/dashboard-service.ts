/**
 * lib/services/dashboard-service.ts — the Dashboard's whole view: configured
 * guides, the homebrew listing, the guide-coverage audit (memoized), links and
 * every configured location (sources, repos, deploy folders). Everything is `.catch`-guarded so an unconfigured
 * install renders empty states, not an error.
 *
 * The source counts need the content index (a couple of seconds cold), so
 * they come from dashboardContent() on their own and fill in after the page.
 */
import { SOURCE_REPOS } from '$lib/data';
import { fs } from '$lib/fs';
import { errorText } from '$lib/util';
import type { HomebrewListing, SourceRef } from '$lib/data';
import { configProvider } from './config';
import { getDataSource } from './datasource';
import { isAuditReady, runAudit, type AuditReport } from './audit-service';
import { setupCompleted, setupDraft } from './setup-service';
import { getContentIndex, type SourceSummary } from './content-index-service';
import { loadSupersessions } from './supersession-service';
import {
  parseBlocklistDocument,
  type BlocklistEntry,
} from '$lib/engine/blocklist';

export interface DashboardView {
  guides: string[];
  homebrew: HomebrewListing;
  audit: AuditReport | null;
  /** Why the audit failed, so the Dashboard can show it instead of nothing. */
  auditError: string | null;
  links: { toolsUrl: string; foundryUrls: string[] };
  /** Configured locations, unset ones left out. Targets are paths or URLs. */
  sources: DashboardSource[];
  setupCompleted: boolean;
  /** Required repos with no folder on disk yet. */
  missingRepos: string[];
  /** Replacement rows plus override rules, as the Replace view lists them. */
  replacementCount: number;
}

/** Sources the blocklist leaves something of. */
export interface DashboardContent {
  coreSources: number;
  /** The user's own brews and partnered books, dependencies not included. */
  homebrewSources: number;
  /** Brews loaded only because another brew depends on them. */
  dependencySources: number;
}

export interface DashboardSource {
  label: string;
  targets: string[];
}

const refTarget = (ref: SourceRef | undefined): string[] => [
  ref?.url ?? ref?.path ?? '',
];

/** Every place the app reads from or writes to, in Settings order. */
function sourceList(): DashboardSource[] {
  const cfg = configProvider().effectiveConfig();
  const app = configProvider().effectiveAppSettings();
  const { repos } = setupDraft();
  const list: DashboardSource[] = [
    { label: 'Source data', targets: refTarget(cfg.data) },
    { label: 'Brew schema', targets: refTarget(cfg.schema) },
    { label: 'Guides', targets: refTarget(cfg.guides) },
    { label: 'Homebrew', targets: refTarget(cfg.homebrew) },
    { label: 'Partnered brews', targets: refTarget(cfg.partnered) },
    ...SOURCE_REPOS.map((r) => ({
      label: `${r.label} repo`,
      targets: [repos[r.id].path, repos[r.id].url],
    })),
    { label: 'Site deploy folders', targets: app.siteDeployFolders },
    { label: 'Homebrew deploy folders', targets: app.homebrewDeployFolders },
  ];
  return list
    .map((s) => ({
      ...s,
      targets: s.targets.map((t) => t.trim()).filter(Boolean),
    }))
    .filter((s) => s.targets.length);
}

async function missingRepos(): Promise<string[]> {
  const { repos } = setupDraft();
  const required = SOURCE_REPOS.filter((r) => r.required);
  const present = await Promise.all(
    required.map((r) => !!repos[r.id].path && fs().exists(repos[r.id].path)),
  );
  return required.filter((_, i) => !present[i]).map((r) => r.label);
}

/**
 * A source is in use unless a rule hides all of it: a whole-source rule, or a
 * whole-type rule for every type it has. Rules for single entries don't count,
 * since the rest of the source is still live.
 */
export function countSourcesInUse(
  sources: Pick<
    SourceSummary,
    'source' | 'isHomebrew' | 'isDependency' | 'types'
  >[],
  entries: Pick<BlocklistEntry, 'hash' | 'category' | 'source'>[],
): DashboardContent {
  const wholeTypes = new Map<string, Set<string>>();
  for (const e of entries) {
    if (e.hash !== '*') continue;
    const src = e.source.toLowerCase();
    const set = wholeTypes.get(src) ?? new Set<string>();
    set.add(e.category.toLowerCase());
    wholeTypes.set(src, set);
  }
  const counts: DashboardContent = {
    coreSources: 0,
    homebrewSources: 0,
    dependencySources: 0,
  };
  for (const s of sources) {
    const blocked = wholeTypes.get(s.source.toLowerCase());
    const hidden =
      !!blocked &&
      (blocked.has('*') ||
        s.types.every((t) => blocked.has(t.prop.toLowerCase())));
    if (hidden) continue;
    if (!s.isHomebrew) counts.coreSources++;
    else if (s.isDependency) counts.dependencySources++;
    else counts.homebrewSources++;
  }
  return counts;
}

export async function dashboardContent(): Promise<DashboardContent> {
  const [index, raw] = await Promise.all([
    getContentIndex(),
    getDataSource()
      .readBlocklistFile()
      .catch(() => null),
  ]);
  const entries = raw ? parseBlocklistDocument(raw).entries : [];
  return countSourcesInUse(index.sources, entries);
}

export async function dashboardView(
  opts: { includeAudit?: boolean } = {},
): Promise<DashboardView> {
  const ds = getDataSource();
  const shouldLoadAudit = opts.includeAudit !== false || isAuditReady();
  let auditError: string | null = null;
  const [guides, homebrew, audit, missing, replacements] = await Promise.all([
    ds.listGuides().catch(() => [] as string[]),
    ds
      .listHomebrew()
      .catch((): HomebrewListing => ({ path: '', exists: false, files: [] })),
    shouldLoadAudit
      ? runAudit().catch((e: unknown) => {
          auditError = errorText(e);
          return null;
        })
      : Promise.resolve(null),
    missingRepos(),
    loadSupersessions().catch(() => null),
  ]);
  // The effective config, so the panel reflects Settings-saved overrides.
  const app = configProvider().effectiveAppSettings();
  return {
    guides,
    homebrew,
    audit,
    auditError,
    links: { toolsUrl: app.toolsUrl, foundryUrls: app.foundryUrls },
    sources: sourceList(),
    setupCompleted: setupCompleted(),
    missingRepos: missing,
    replacementCount: replacements
      ? replacements.rows.length + replacements.overrides.length
      : 0,
  };
}
