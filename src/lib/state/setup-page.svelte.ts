/**
 * lib/state/setup-page.svelte.ts — state, folder inspection, git sync, and
 * portable import actions for the first-run Setup walkthrough (`/setup`).
 */
import { goto } from '$app/navigation';
import {
  SOURCE_REPOS,
  defaultRepoFolders,
  type SourceRepoId,
} from '$lib/data';
import {
  finishSetup,
  getCapabilities,
  getInstalledSetup,
  getSetupDraft,
  gitVersion,
  importInstalledSetup,
  inspectSetupFolder,
  isTauri,
  loadAppFonts,
  useSiteIcons,
  onSetupProgress,
  pickFolderDialog,
  restartLocalServer,
  syncSetupRepo,
  type FolderCheck,
  type SetupDraft,
} from '$lib/api';
import { errorText } from '$lib/util';
import { forget } from '$lib/state/page-cache.svelte.ts';
import { resetSourceDisplay } from '$lib/state/source-display.svelte.ts';

export const SETUP_STEPS = ['Repos', 'Folders', 'Download', 'Deployment'];
export const SETUP_CARD_TITLES = [
  'Repos',
  'Folders',
  'Download or update',
  'Deployment',
];

// Source Data lock entries use these older ids.
const LOCK_IDS: Record<SourceRepoId, string | null> = {
  tools: '5e',
  siteImages: '5e-img',
  homebrew: '5e-homebrew',
  images: 'homebrew-img',
  utils: '5etools-utils',
};

export interface SetupRowRun {
  state: 'running' | 'done' | 'error';
  percent: number | null;
  message: string;
}

export function folderNote(check: FolderCheck | undefined): {
  text: string;
  variant: 'default' | 'positive' | 'warning';
} {
  switch (check?.state) {
    case 'missing':
      return {
        text: "Doesn't exist yet; it'll be created.",
        variant: 'default',
      };
    case 'empty':
      return { text: 'Empty; the repo downloads here.', variant: 'default' };
    case 'match':
      return {
        text: `Has this repo${check.commitDate ? ` · last commit ${check.commitDate}` : ''}`,
        variant: 'positive',
      };
    case 'otherRepo':
      return {
        text: `Holds a different repo (${check.remote ?? 'no origin'})`,
        variant: 'warning',
      };
    case 'noGit':
      return { text: 'Has files but no git', variant: 'warning' };
    default:
      return { text: '', variant: 'default' };
  }
}

export const canSyncFolder = (check: FolderCheck | undefined): boolean =>
  !check || ['missing', 'empty', 'match'].includes(check.state);

/** GitHub serves the default branch as a ZIP at /archive/HEAD.zip. */
export const zipUrl = (url: string): string =>
  `${url
    .trim()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')}/archive/HEAD.zip`;

export class SetupPage {
  desktop = $state(false);
  nativeDialogs = $state(false);
  step = $state(0);
  draft = $state<SetupDraft | null>(null);
  loadError = $state<string | null>(null);
  checks = $state<Partial<Record<SourceRepoId, FolderCheck>>>({});
  git = $state<string | null | undefined>(undefined);
  runs = $state<Partial<Record<SourceRepoId, SetupRowRun>>>({});
  syncing = $state(false);
  finishing = $state(false);
  finishError = $state<string | null>(null);

  // A portable copy on a machine with the installed app can import its setup.
  installed = $state<string | null>(null);
  importOpen = $state(true);
  importing = $state(false);
  importError = $state<string | null>(null);
  imported = $state<string[] | null>(null);

  readonly requiredUrlsSet = $derived(
    !!this.draft &&
      SOURCE_REPOS.every(
        (r) => !r.required || this.draft!.repos[r.id].url.trim(),
      ),
  );

  // Image repos are optional: with no URL they aren't downloaded.
  readonly activeRepos = $derived(
    SOURCE_REPOS.filter(
      (r) => r.required || this.draft?.repos[r.id].url.trim(),
    ),
  );

  inspect = async (id: SourceRepoId): Promise<void> => {
    if (!this.draft) return;
    const { url, path } = this.draft.repos[id];
    if (!path.trim()) {
      delete this.checks[id];
      return;
    }
    const check = await inspectSetupFolder(path, url).catch(() => null);
    if (!check) return;
    this.checks[id] = check;
    // An existing checkout tells us its URL.
    if (!url.trim() && check.remote) this.draft.repos[id].url = check.remote;
  };

  inspectAll = (): Promise<void[]> =>
    Promise.all(SOURCE_REPOS.map((r) => this.inspect(r.id)));

  checkGit = async (): Promise<void> => {
    this.git = await gitVersion().catch(() => null);
  };

  setParent = (parent: string): void => {
    if (!this.draft) return;
    this.draft.parent = parent;
    if (!parent.trim()) return;
    const folders = defaultRepoFolders(parent.trim());
    for (const r of SOURCE_REPOS) this.draft.repos[r.id].path = folders[r.id];
    void this.inspectAll();
  };

  browseParent = async (): Promise<void> => {
    const picked = await pickFolderDialog(this.draft?.parent || undefined);
    if (picked) this.setParent(picked);
  };

  browseRepo = async (id: SourceRepoId): Promise<void> => {
    if (!this.draft) return;
    const picked = await pickFolderDialog(
      this.draft.repos[id].path || undefined,
    );
    if (picked) {
      this.draft.repos[id].path = picked;
      void this.inspect(id);
    }
  };

  syncAll = async (): Promise<void> => {
    if (!this.draft) return;
    this.syncing = true;
    // One at a time: several large clones at once only compete for bandwidth.
    for (const r of this.activeRepos) {
      const { url, path } = this.draft.repos[r.id];
      if (!url.trim() || !path.trim() || !canSyncFolder(this.checks[r.id]))
        continue;
      this.runs[r.id] = {
        state: 'running',
        percent: null,
        message: 'Starting…',
      };
      try {
        const out = await syncSetupRepo({
          id: r.id,
          url,
          path,
          lockId: LOCK_IDS[r.id],
        });
        this.runs[r.id] = {
          state: 'done',
          percent: 100,
          message:
            out.action === 'skippedLocked'
              ? 'Locked in Source Data, so not updated.'
              : out.action === 'cloned'
                ? 'Downloaded.'
                : 'Updated.',
        };
      } catch (err) {
        this.runs[r.id] = {
          state: 'error',
          percent: null,
          message: errorText(err),
        };
      }
      await this.inspect(r.id);
    }
    this.syncing = false;
  };

  rowStatus = (id: SourceRepoId): string => {
    const check = this.checks[id];
    if (check?.state === 'match')
      return check.commitDate ? `Last commit ${check.commitDate}` : 'Present';
    if (check?.state === 'otherRepo' || check?.state === 'noGit')
      return `${folderNote(check).text}; go back to Folders to change it.`;
    return 'Not downloaded yet';
  };

  finish = async (): Promise<void> => {
    if (!this.draft) return;
    this.finishing = true;
    this.finishError = null;
    try {
      await finishSetup(this.draft);
      // The Tools source checkout may have just arrived with its icons.
      void useSiteIcons();
      forget();
      resetSourceDisplay();
      // The local site server serves the tools folder, which may have moved.
      await restartLocalServer().catch(() => null);
      await goto('/');
    } catch (err) {
      this.finishError = errorText(err);
    } finally {
      this.finishing = false;
    }
  };

  loadDraft = (): Promise<void | void[] | string> =>
    getSetupDraft()
      .then((d) => {
        this.draft = d;
        this.checks = {};
        return this.inspectAll();
      })
      .catch((err) => (this.loadError = errorText(err)));

  importInstalled = async (): Promise<void> => {
    this.importing = true;
    this.importError = null;
    try {
      this.imported = await importInstalledSetup();
      this.importOpen = false;
      this.step = 0;
      // The layout loads fonts once at startup, before these were here.
      void loadAppFonts();
      void useSiteIcons();
      await this.loadDraft();
    } catch (err) {
      this.importError = errorText(err);
    } finally {
      this.importing = false;
    }
  };

  #start(portableImport: boolean): Promise<() => void> {
    void this.loadDraft();
    if (portableImport) {
      getInstalledSetup()
        .then((p) => (this.installed = p))
        .catch(() => null);
    }
    void this.checkGit();
    return onSetupProgress((ev) => {
      const id = ev.id as SourceRepoId;
      const run = this.runs[id];
      if (run?.state !== 'running') return;
      run.message = ev.message;
      if (ev.percent !== null) run.percent = ev.percent;
    });
  }

  mount = (): (() => void) | void => {
    const tauri = isTauri();
    this.desktop = tauri;
    this.nativeDialogs = tauri;
    if (tauri) {
      const unlisten = this.#start(true);
      return () => {
        void unlisten.then((stop) => stop());
      };
    }
    let unlisten: Promise<() => void> | null = null;
    let disposed = false;
    void getCapabilities()
      .then((caps) => {
        if (disposed || !caps.repos) return;
        this.desktop = true;
        this.nativeDialogs = caps.nativeDialogs;
        unlisten = this.#start(caps.portableImport);
        if (disposed) void unlisten.then((stop) => stop());
      })
      .catch(() => null);
    return () => {
      disposed = true;
      if (unlisten) void unlisten.then((stop) => stop());
    };
  };
}
