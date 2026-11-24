/**
 * lib/state/files-page.svelte.ts - the Homebrew Files view's per-file actions
 * and their results: scan, submission lint, copy a fix prompt, check against a
 * connected Foundry world, deploy, remove, plus the folder-wide collision
 * check and the Foundry bridge badge.
 *
 * Results are kept here by file name rather than in each row, so a row that
 * a search hides and shows again still has them. One instance per visit.
 */
import { invalidateAll } from '$app/navigation';
import { forget } from '$lib/state/page-cache.svelte.ts';
import { foundry, refreshFoundryStatus } from '$lib/state/foundry.svelte.ts';
import { BusySet } from '$lib/state/busy-set.svelte.ts';
import { errorText, formatFolderOutcome, type FolderOutcome } from '$lib/util';
import { copyFixPrompt } from '$lib/prompt-client';
import { describeFixPrompt } from '$lib/engine/audit';
import type { LintReport, Collision, CollisionReport } from '$lib/engine/audit';
import {
  allowFoundryOrigin,
  checkFoundry as checkFoundryFile,
  deployHomebrew,
  getCollisions,
  openInFoundry,
  lintFile,
  retireHomebrew,
  scanHomebrewFile,
  type CheckResponse,
  type DocumentValidation,
} from '$lib/api';

/** One file's scan totals, or why the scan failed (ScanSummary draws it). */
export type Scan = DocumentValidation['totals'] | { error: string };

export type LintResult =
  { lint: LintReport; collisions: Collision[] } | { error: string };

export class FilesPage {
  scans = $state<Record<string, Scan>>({});
  readonly scanning = new BusySet();

  // Rows start collapsed to one line; actions and tags show on expand.
  expanded = $state<Set<string>>(new Set());

  bridge = $derived(foundry.status);
  readonly checking = new BusySet();
  checkErrors = $state<Record<string, string>>({});
  report = $state<CheckResponse | null>(null);
  readonly deploying = new BusySet();
  deployNote = $state<Record<string, FolderOutcome>>({});

  lints = $state<Record<string, LintResult>>({});
  readonly linting = new BusySet();
  collisionReport = $state<CollisionReport | { error: string } | null>(null);
  collisionsOpen = $state(false);
  loadingCollisions = $state(false);

  readonly prompting = new BusySet();
  promptNote = $state<Record<string, FolderOutcome>>({});

  readonly removing = new BusySet();
  libraryNote = $state<FolderOutcome | null>(null);

  allowing = $state<string | null>(null);
  allowError = $state('');

  /** The world chosen in the picker; undefined until there's more than one. */
  clientId = $state<string | undefined>(undefined);
  activeClient = $derived(
    this.clientId ??
      (this.bridge.clients.length === 1
        ? this.bridge.clients[0].clientId
        : undefined),
  );

  worldLabel = $derived(
    this.bridge.clients.length === 1
      ? this.bridge.clients[0].world
      : this.bridge.clients.length > 1
        ? `${this.bridge.clients.length} worlds`
        : '',
  );

  bridgeTitle = $derived.by(() => {
    const bridge = this.bridge;
    if (bridge.connected) {
      const worlds = bridge.clients
        .map((c) => `${c.world} — ${c.system} ${c.systemVersion}`)
        .join(', ');
      return `Connected to ${worlds}`;
    }
    // Desktop only: the Rust bridge reports where it listens, or why it can't.
    if (bridge.managerUrl && bridge.error) {
      return `The Foundry bridge isn't running: ${bridge.error}`;
    }
    if (bridge.refused.length) {
      const list = bridge.refused
        .map((r) => (r.world ? `${r.world} (${r.origin})` : r.origin))
        .join(', ');
      return `Refused ${list}: not in Settings → Foundry URL. Click Allow to let it connect.`;
    }
    const where = bridge.managerUrl
      ? ` This app listens at ${bridge.managerUrl}; the module connects there by default.`
      : '';
    return `Open a Foundry world with the Homebrew Manager Bridge module enabled.${where} If it still doesn't connect, open Bridge Status in the module's settings.`;
  });

  toggleRow = (file: string): void => {
    const next = new Set(this.expanded);
    if (!next.delete(file)) next.add(file);
    this.expanded = next;
  };

  /** Allowlist a refused world. It reconnects on its own within a few seconds. */
  allow = async (origin: string): Promise<void> => {
    this.allowing = origin;
    this.allowError = '';
    try {
      await allowFoundryOrigin(origin);
      await refreshFoundryStatus();
    } catch (e) {
      this.allowError = (e as Error).message;
    } finally {
      this.allowing = null;
    }
  };

  /** Open a report match's sheet in the world the report came from. */
  openMatch = async (uuid: string): Promise<void> => {
    if (!this.report) return;
    await openInFoundry(this.report.client.clientId, uuid);
  };

  checkFoundry = async (file: string): Promise<void> => {
    await this.checking.run(file, async () => {
      this.checkErrors = { ...this.checkErrors, [file]: '' };
      try {
        this.report = await checkFoundryFile(file, this.activeClient);
      } catch (e) {
        this.checkErrors = { ...this.checkErrors, [file]: errorText(e) };
      }
    });
  };

  scan = async (file: string): Promise<void> => {
    await this.scanning.run(file, async () => {
      try {
        this.scans = {
          ...this.scans,
          [file]: (await scanHomebrewFile(file)).totals,
        };
      } catch (e) {
        this.scans = { ...this.scans, [file]: { error: errorText(e) } };
      }
    });
  };

  lint = async (file: string): Promise<void> => {
    const prev = this.lints[file];
    if (prev && !('error' in prev)) {
      // A second click hides the results.
      const next = { ...this.lints };
      delete next[file];
      this.lints = next;
      return;
    }
    await this.linting.run(file, async () => {
      try {
        this.lints = { ...this.lints, [file]: await lintFile(file) };
      } catch (e) {
        this.lints = { ...this.lints, [file]: { error: errorText(e) } };
      }
    });
  };

  /** Scan + lint the file and copy a prompt a model can fix it from. */
  copyPrompt = async (file: string): Promise<void> => {
    await this.prompting.run(file, async () => {
      try {
        const p = await copyFixPrompt({ file });
        this.promptNote = {
          ...this.promptNote,
          [file]: { ok: true, text: describeFixPrompt(p) },
        };
      } catch (e) {
        this.promptNote = {
          ...this.promptNote,
          [file]: {
            ok: false,
            text: `Couldn't copy a fix prompt: ${errorText(e)}`,
          },
        };
      }
    });
  };

  loadCollisions = async (refresh = false): Promise<void> => {
    this.collisionsOpen = true;
    this.loadingCollisions = true;
    try {
      this.collisionReport = await getCollisions(refresh);
    } catch (e) {
      this.collisionReport = { error: (e as Error).message };
    } finally {
      this.loadingCollisions = false;
    }
  };

  toggleCollisions = (): void => {
    if (this.collisionsOpen && this.collisionReport)
      this.collisionsOpen = false;
    else this.loadCollisions();
  };

  remove = async (file: string): Promise<void> => {
    if (!confirm(`Move “${file}” to unused/ and drop it from index.json?`))
      return;
    await this.removing.run(file, async () => {
      try {
        const { done, errors } = await retireHomebrew(file);
        const outcome = formatFolderOutcome(
          'Moved to unused/ in',
          done.length,
          errors,
        );
        this.libraryNote = { ...outcome, text: `${file} — ${outcome.text}` };
        // Wait for the real list; the remembered one still has the file in it.
        forget('files', 'files-library', 'dashboard');
        await invalidateAll();
      } catch (e) {
        this.libraryNote = { ok: false, text: errorText(e) };
      }
    });
  };

  deploy = async (file: string): Promise<void> => {
    await this.deploying.run(file, async () => {
      this.deployNote = { ...this.deployNote, [file]: { ok: true, text: '' } };
      try {
        const { copied, errors: errs } = await deployHomebrew(file);
        this.deployNote = {
          ...this.deployNote,
          [file]: formatFolderOutcome(
            'Copied to',
            copied.length,
            errs,
            'Deploy failed',
          ),
        };
      } catch (e) {
        this.deployNote = {
          ...this.deployNote,
          [file]: { ok: false, text: errorText(e) },
        };
      }
    });
  };
}
