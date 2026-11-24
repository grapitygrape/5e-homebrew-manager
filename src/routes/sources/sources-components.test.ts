/**
 * Server-side render tests for SchemaSyncBanner, UpstreamCheckCard, and RepoCard in `/sources`.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import type {
  RepoStatus,
  SchemaSyncReport,
  UpstreamCheckReport,
} from '$lib/api';
import { SourcesPage } from '$lib/state/sources-page.svelte.ts';
import SchemaSyncBanner from './SchemaSyncBanner.svelte';
import UpstreamCheckCard from './UpstreamCheckCard.svelte';
import RepoCard from './RepoCard.svelte';

const repo = (over: Partial<RepoStatus> = {}): RepoStatus => ({
  id: '5e',
  label: '5etools',
  path: 'C:\\dnd\\5e',
  exists: true,
  branch: 'main',
  commit: 'abc1234',
  fullCommit: 'abc1234567890',
  commitDate: '2026-11-01',
  commitTimestamp: 1730000000,
  commitSubject: 'Release v2.0.0',
  packageVersion: '2.0.0',
  versionTag: { name: 'v2.0.0', timestamp: 1730000000 },
  exactTag: 'v2.0.0',
  nearestTag: 'v2.0.0',
  recentTags: [{ name: 'v2.0.0', timestamp: 1730000000 }],
  behindCount: 0,
  aheadCount: 0,
  dirtyFiles: [],
  atPinnedCommit: true,
  lock: {
    locked: false,
    pinnedCommit: null,
    pinnedRef: null,
    note: '',
    follow5ePackageJson: false,
    follow5eDate: false,
  },
  ...over,
});

const stripComments = (html: string) =>
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');

describe('SchemaSyncBanner', () => {
  it('shows clean status without fix buttons when synced', () => {
    const schema: SchemaSyncReport = {
      status: 'synced',
      siteVersion: '2.0.0',
      expectedUtilsVersion: '2.0.0',
      actualUtilsVersion: '2.0.0',
      message: 'Synced',
      homebrewCommitsAfter5e: 0,
    };
    const body = stripComments(
      render(SchemaSyncBanner, {
        props: {
          schema,
          site: repo(),
          homebrewAnchored: false,
          busy: false,
          onSyncUtils: () => {},
          onSyncHomebrew: () => {},
        },
      }).body,
    );

    expect(body).toContain('Version check');
    expect(body).toContain('5etools-utils v2.0.0');
    expect(body).not.toContain('Match to 5e');
    expect(body).not.toContain("Roll back to 5e's date");
  });

  it('offers fix buttons when schemas drift or homebrew is newer than 5e', () => {
    const schema: SchemaSyncReport = {
      status: 'behind',
      siteVersion: '2.0.0',
      expectedUtilsVersion: '2.0.0',
      actualUtilsVersion: '1.9.0',
      message: 'Schemas are behind 5e.',
      homebrewCommitsAfter5e: 4,
    };
    const body = stripComments(
      render(SchemaSyncBanner, {
        props: {
          schema,
          site: repo(),
          homebrewAnchored: true,
          busy: false,
          onSyncUtils: () => {},
          onSyncHomebrew: () => {},
        },
      }).body,
    );

    expect(body).toContain('Schemas are behind 5e.');
    expect(body).toContain('Match to 5e');
    expect(body).toContain('4 commits newer');
    expect(body).toContain("Roll back to 5e's date");
  });
});

describe('UpstreamCheckCard', () => {
  const baseReport = (
    over: Partial<UpstreamCheckReport> = {},
  ): UpstreamCheckReport => ({
    checkedAt: 1730000000,
    fetched: true,
    upToDate: true,
    ready: true,
    site: {
      id: '5e',
      label: '5etools',
      currentVersion: '2.41.2',
      targetVersion: '2.41.2',
      targetRef: 'origin/main',
      targetDescribe: 'v2.41.2',
      behindCommits: 0,
    },
    utils: {
      id: '5etools-utils',
      label: '5etools-utils',
      currentVersion: '0.17.39',
      targetVersion: '0.17.39',
      targetRef: 'v0.17.39',
      targetDescribe: 'v0.17.39',
      behindCommits: 0,
    },
    wantedUtils: '0.17.39',
    patchesChecked: 42,
    diffsChecked: 1,
    issues: [],
    warnings: [],
    ...over,
  });

  it('shows ready summary when up to date with no issues', () => {
    const body = stripComments(
      render(UpstreamCheckCard, {
        props: {
          report: baseReport(),
          busy: false,
          onRecheck: () => {},
          onDismiss: () => {},
        },
      }).body,
    );
    expect(body).toContain('Upstream readiness');
    expect(body).toContain('Up to date and all active modules apply cleanly');
    expect(body).toContain('42 patches, 1 diff');
  });

  it('lists blocking issues and inactive notice count when modules break upstream', () => {
    const body = stripComments(
      render(UpstreamCheckCard, {
        props: {
          report: baseReport({
            upToDate: false,
            ready: false,
            site: {
              id: '5e',
              label: '5etools',
              currentVersion: '2.41.2',
              targetVersion: '2.42.0',
              targetRef: 'origin/main',
              targetDescribe: 'v2.42.0',
              behindCommits: 3,
            },
            issues: [
              {
                category: 'patch',
                module: 'trim-navigation',
                enabled: true,
                message: 'js/navigation.js anchor missing',
              },
              {
                category: 'copy',
                module: 'home-page',
                enabled: false,
                message: 'index.html changed upstream',
              },
            ],
          }),
          busy: false,
          onRecheck: () => {},
          onDismiss: () => {},
        },
      }).body,
    );
    expect(body).toContain('1 issue needs attention');
    expect(body).toContain('v2.41.2 → v2.42.0 (3 commits behind origin/main)');
    expect(body).toContain('trim-navigation');
    expect(body).toContain('js/navigation.js anchor missing');
    expect(body).toContain('1 additional notice on disabled or replaced');
  });
});

describe('RepoCard', () => {
  it('renders drift banner and rollback button when locked repo moved off pin', () => {
    const page = new SourcesPage();
    const drifted = repo({
      atPinnedCommit: false,
      commit: 'def5678',
      dirtyFiles: ['js/parser.js'],
      lock: {
        locked: true,
        pinnedCommit: 'abc1234',
        pinnedRef: 'v2.0.0',
        note: 'Pinned for release',
        follow5ePackageJson: false,
        follow5eDate: false,
      },
    });
    page.tagChoice[drifted.id] = '';
    page.customRef[drifted.id] = '';

    const body = stripComments(
      render(RepoCard, { props: { repo: drifted, page } }).body,
    );
    expect(body).toContain('Locked at abc1234');
    expect(body).toContain(
      'Moved off its locked commit abc1234 (now at def5678)',
    );
    expect(body).toContain('Roll back to abc1234');
    expect(body).toContain('1 changed');
  });

  it('renders repo-specific Prepare toggles and missing-folder prompt', () => {
    const page = new SourcesPage();
    const utils = repo({ id: '5etools-utils', label: '5etools-utils' });
    page.tagChoice[utils.id] = '';
    page.customRef[utils.id] = '';
    const utilsBody = stripComments(
      render(RepoCard, { props: { repo: utils, page } }).body,
    );
    expect(utilsBody).toContain('Auto-match 5e/package.json on Prepare');

    const missing = repo({
      id: '5e-img',
      label: '5e images',
      path: '',
      exists: false,
    });
    const missingBody = stripComments(
      render(RepoCard, { props: { repo: missing, page } }).body,
    );
    expect(missingBody).toContain('Not set. Choose its folder in');
  });
});
