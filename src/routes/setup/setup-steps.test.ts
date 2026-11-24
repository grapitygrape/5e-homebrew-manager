/**
 * Server-side render tests for the Setup step components and portable import
 * banner, plus pure helper checks from `setup-page.svelte.ts`.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import type { FolderCheck, SetupDraft } from '$lib/api';
import {
  SetupPage,
  canSyncFolder,
  folderNote,
  zipUrl,
} from '$lib/state/setup-page.svelte.ts';
import SetupImportBanner from './SetupImportBanner.svelte';
import SetupReposStep from './SetupReposStep.svelte';
import SetupFoldersStep from './SetupFoldersStep.svelte';
import SetupDownloadStep from './SetupDownloadStep.svelte';
import SetupDeployStep from './SetupDeployStep.svelte';

const check = (
  state: FolderCheck['state'],
  over: Partial<FolderCheck> = {},
): FolderCheck => ({
  state,
  commitDate: null,
  remote: null,
  shallow: false,
  ...over,
});

const makeDraft = (): SetupDraft => ({
  parent: 'C:\\dnd',
  repos: {
    tools: {
      url: 'https://github.com/5etools-mirror-3/5etools-src',
      path: 'C:\\dnd\\5e',
    },
    siteImages: { url: '', path: '' },
    homebrew: {
      url: 'https://github.com/TheGiddyLimit/homebrew',
      path: 'C:\\dnd\\5e-homebrew',
    },
    images: { url: '', path: '' },
    utils: {
      url: 'https://github.com/TheGiddyLimit/5etools-utils',
      path: 'C:\\dnd\\5etools-utils',
    },
  },
  siteDeployFolders: ['C:\\www\\5e'],
  homebrewDeployFolders: ['C:\\foundry\\Data\\homebrew'],
});

const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('Setup step helpers', () => {
  it('formats GitHub ZIP archive URLs cleanly', () => {
    expect(zipUrl('https://github.com/org/repo.git')).toBe(
      'https://github.com/org/repo/archive/HEAD.zip',
    );
    expect(zipUrl(' https://github.com/org/repo/// ')).toBe(
      'https://github.com/org/repo/archive/HEAD.zip',
    );
  });

  it('classifies folder check states and sync eligibility', () => {
    expect(
      folderNote(check('match', { commitDate: '2026-11-01' })).variant,
    ).toBe('positive');
    expect(folderNote(check('noGit')).variant).toBe('warning');
    expect(canSyncFolder(undefined)).toBe(true);
    expect(canSyncFolder(check('empty'))).toBe(true);
    expect(canSyncFolder(check('otherRepo', { remote: 'x' }))).toBe(false);
  });
});

describe('Setup components', () => {
  it('renders portable import prompt and imported warnings', () => {
    const page = new SetupPage();
    page.installed = 'C:\\Users\\Me\\AppData\\Roaming\\5e Homebrew Manager';
    page.imported = ['Skipped missing font'];

    const body = stripComments(
      render(SetupImportBanner, { props: { page } }).body,
    );
    expect(body).toContain("Import the installed app's setup?");
    expect(body).toContain('C:\\Users\\Me\\AppData\\Roaming\\5e Homebrew Manager');
    expect(body).toContain('Skipped missing font');
  });

  it('renders URL fields in SetupReposStep and folder notes in SetupFoldersStep', () => {
    const page = new SetupPage();
    const draft = makeDraft();
    page.draft = draft;
    page.checks = {
      tools: check('match', { commitDate: '2026-11-01' }),
      homebrew: check('noGit'),
    };

    const reposBody = stripComments(
      render(SetupReposStep, { props: { page, draft } }).body,
    );
    expect(reposBody).toContain('The GitHub repos to download.');
    expect(reposBody).toContain('(optional)');

    const foldersBody = stripComments(
      render(SetupFoldersStep, { props: { page, draft } }).body,
    );
    expect(foldersBody).toContain('Save all repos under');
    expect(foldersBody).toContain('Has this repo · last commit 2026-11-01');
    expect(foldersBody).toContain('Has files but no git');
  });

  it('renders git version + sync button when git is present, ZIP links when missing', () => {
    const page = new SetupPage();
    const draft = makeDraft();
    page.draft = draft;
    page.git = '2.47.0';

    const withGit = stripComments(
      render(SetupDownloadStep, { props: { page, draft } }).body,
    );
    expect(withGit).toContain('Git 2.47.0');
    expect(withGit).toContain('Download / update all');

    page.git = null;
    const noGit = stripComments(
      render(SetupDownloadStep, { props: { page, draft } }).body,
    );
    expect(noGit).toContain('Git needs to be installed on your machine.');
    expect(noGit).toContain('ZIP');
    expect(noGit).not.toContain('Download / update all');
  });

  it('renders deploy folder lists and finish error in SetupDeployStep', () => {
    const page = new SetupPage();
    const draft = makeDraft();
    page.draft = draft;
    page.finishError = 'Could not save settings';

    const body = stripComments(
      render(SetupDeployStep, { props: { page, draft } }).body,
    );
    expect(body).toContain('Deploy site to');
    expect(body).toContain('Deploy homebrew files to');
    expect(body).toContain('Could not save settings');
  });
});
