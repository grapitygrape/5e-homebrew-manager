/**
 * lib/state/blocklist-page.svelte.ts — state and document actions for the Hide
 * Content (`/blocklist`) view: load/refresh, site-browser rule intake, import,
 * export, cascade unblocking, save, and deploy (file copy + Foundry world push).
 */
import type {
  BlocklistBannerState,
  CascadeChoice,
  CascadePrompt,
} from '$lib/components/blocklist/blocklist-model.ts';
import {
  blocklistSnapshot,
  mergeSiteRules,
} from '$lib/components/blocklist/blocklist-model.ts';
import {
  cascadeBannerText,
  cascadeEdit,
} from '$lib/components/blocklist/cascade-edit.ts';
import { entryKey, serializeBlocklistDocument } from '$lib/engine/blocklist';
import type { BlocklistEntry, EntryDiagnosis } from '$lib/engine/blocklist';
import {
  blocklistWorlds,
  describeWorldPush,
  toWorldRules,
  type WorldPushOutcome,
} from '$lib/engine/foundry/blocklist-push.ts';
import {
  deployHomebrew,
  getBlocklist,
  importBlocklist,
  onSiteBlocklistAdded,
  saveBlocklist,
  sendBlocklistToFoundry,
  takeSiteBlocklistRules,
  type LoadedBlocklist,
} from '$lib/api';
import { refreshFoundryStatus } from '$lib/state/foundry.svelte.ts';
import { peek, remember, tracked } from '$lib/state/page-cache.svelte.ts';
import { formatNumber, plural } from '$lib/util';

const LIST_KEY = 'blocklist-doc';

export class BlocklistPage {
  entries = $state<BlocklistEntry[]>([]);
  envelope = $state<Record<string, unknown>>({});
  diagnoses = $state<EntryDiagnosis[]>([]);
  collapsed = $state<string[]>([]);
  savedSnapshot = $state('');
  fileExists = $state(false);

  loadingList = $state(true);
  busy = $state(false);
  deploying = $state(false);
  banner = $state<BlocklistBannerState | null>(null);
  ruleQuery = $state('');

  pendingCascade = $state<{
    prompt: CascadePrompt;
    resolve: (choice: CascadeChoice) => void;
  } | null>(null);

  // Bumped on every read or write so an older background re-read drops its result.
  private listGeneration = 0;
  private refreshing = false;

  readonly dirty = $derived(
    this.savedSnapshot !== blocklistSnapshot(this.entries),
  );

  readonly diagnosisByKey = $derived(
    new Map(this.diagnoses.map((d) => [d.key, d])),
  );

  readonly unmatched = $derived(
    this.entries.filter(
      (e) =>
        !e.isAuto &&
        this.diagnosisByKey.get(entryKey(e))?.code === 'unknown-source',
    ),
  );

  setBanner = (next: BlocklistBannerState | null): void => {
    this.banner = next;
  };

  /** Shows the child-cascade dialog; a newer prompt cancels an older one. */
  confirmCascade = (prompt: CascadePrompt): Promise<CascadeChoice> => {
    this.pendingCascade?.resolve('cancel');
    return new Promise((resolve) => {
      this.pendingCascade = { prompt, resolve };
    });
  };

  answerCascade = (choice: CascadeChoice): void => {
    const p = this.pendingCascade;
    this.pendingCascade = null;
    p?.resolve(choice);
  };

  removeUnmatched = (): void => {
    const doomed = new Set(this.unmatched.map(entryKey));
    if (!doomed.size) return;
    this.entries = this.entries.filter((e) => !doomed.has(entryKey(e)));
    this.setBanner({
      tone: 'ok',
      text: `Removed ${formatNumber(doomed.size)} ${plural(doomed.size, 'rule', 'rules')} for sources you don't have. Nothing is written until you Save - Cancel puts them back.`,
    });
  };

  applyList = (doc: LoadedBlocklist): void => {
    this.entries = doc.entries;
    this.envelope = doc.envelope;
    this.diagnoses = doc.diagnoses;
    this.fileExists = doc.exists;
    this.collapsed = doc.collapsed;

    const clean =
      doc.repairedCount === 0 &&
      doc.duplicatesRemoved === 0 &&
      doc.collapsed.length === 0;
    this.savedSnapshot = clean
      ? blocklistSnapshot(doc.entries)
      : `${blocklistSnapshot(doc.entries)}::pending`;

    const notes: string[] = [];
    if (doc.repairedCount) {
      notes.push(
        `${doc.repairedCount} ${plural(doc.repairedCount, 'rule', 'rules')} didn't match any content as written and ${plural(doc.repairedCount, 'was', 'were')} repaired`,
      );
    }
    const dropped = doc.duplicatesRemoved + doc.collapsed.length;
    if (dropped) {
      notes.push(
        `${dropped} duplicate ${plural(dropped, 'rule', 'rules')} dropped`,
      );
    }
    const unknown = doc.diagnoses.filter(
      (d) => d.code === 'unknown-source',
    ).length;
    if (unknown) {
      notes.push(
        `${unknown} ${plural(unknown, 'rule targets a source', 'rules target sources')} you don't have installed`,
      );
    }
    if (notes.length) {
      this.setBanner({
        tone: 'warn',
        text: `${notes.join('; ')}. Review below, then Save to write the corrected file.`,
        action: unknown
          ? { label: 'Remove unmatched sources', run: this.removeUnmatched }
          : undefined,
      });
    }
  };

  loadList = async (): Promise<void> => {
    this.listGeneration++;
    this.loadingList = true;
    try {
      this.applyList(remember(LIST_KEY, await getBlocklist()));
    } catch (e) {
      this.setBanner({
        tone: 'error',
        text: `Could not read the blocklist: ${(e as Error).message}`,
      });
    } finally {
      this.loadingList = false;
    }
    void this.absorbSiteRules();
  };

  /** Draws the remembered file now, then swaps in a fresh read if untouched. */
  refreshList = async (remembered: LoadedBlocklist): Promise<void> => {
    this.applyList(remembered);
    this.loadingList = false;
    const shown = blocklistSnapshot(this.entries);
    const started = this.listGeneration;
    this.refreshing = true;
    try {
      const fresh = await tracked(getBlocklist());
      if (this.listGeneration !== started) return;
      remember(LIST_KEY, fresh);
      if (blocklistSnapshot(this.entries) === shown) this.applyList(fresh);
    } catch (e) {
      this.setBanner({
        tone: 'error',
        text: `Could not re-read the blocklist: ${(e as Error).message}`,
      });
    } finally {
      this.refreshing = false;
    }
    void this.absorbSiteRules();
  };

  /**
   * Pulls rules queued by the desktop site browser into unsaved edits once the
   * file finishes loading (a load would overwrite them).
   */
  absorbSiteRules = async (): Promise<void> => {
    if (this.loadingList || this.refreshing) return;
    let incoming;
    try {
      incoming = await takeSiteBlocklistRules();
    } catch (e) {
      this.setBanner({
        tone: 'error',
        text: `Could not get rules from the site browser: ${(e as Error).message}`,
      });
      return;
    }
    if (!incoming.length) return;
    const res = mergeSiteRules(this.entries, incoming);
    this.entries = res.entries;
    const already = res.skipped
      ? ` (${formatNumber(res.skipped)} already blocked)`
      : '';
    this.setBanner({
      tone: 'ok',
      text: `Added ${formatNumber(res.added)} ${plural(res.added, 'rule', 'rules')} from the site browser${already}. Nothing is written until you Save.`,
    });
  };

  removeRule = async (entry: BlocklistEntry): Promise<void> => {
    if (entry.isAuto) {
      this.setBanner({
        tone: 'warn',
        text: "That rule is auto-managed and can't be removed here.",
      });
      return;
    }

    const key = entryKey(entry);
    const res = await cascadeEdit({
      mode: 'unblock',
      target: entry,
      current: () => this.entries,
      change: (list) => list.filter((e) => entryKey(e) !== key),
      confirm: this.confirmCascade,
      onwarn: (text) => this.setBanner({ tone: 'warn', text }),
    });
    if (!res) return;
    this.entries = res.entries;
    const text = cascadeBannerText(res);
    if (text) this.setBanner({ tone: 'ok', text });
  };

  importFile = async (
    file: File,
    mode: 'replace' | 'merge',
  ): Promise<void> => {
    this.busy = true;
    this.setBanner(null);
    try {
      const doc = await importBlocklist(JSON.parse(await file.text()));
      this.listGeneration++;

      if (mode === 'replace') {
        this.entries = doc.entries;
        this.envelope = doc.envelope;
        this.diagnoses = doc.diagnoses;
        this.collapsed = doc.collapsed;
        this.setBanner({
          tone: 'ok',
          text: `Imported ${doc.entries.length} rules from ${file.name}${doc.repairedCount ? `, ${doc.repairedCount} repaired` : ''}. Nothing is written until you Save.`,
        });
      } else {
        const existing = new Set(this.entries.map(entryKey));
        const added = doc.entries.filter((e) => !existing.has(entryKey(e)));
        this.entries = [...this.entries, ...added];
        this.diagnoses = [];
        this.collapsed = [];
        this.setBanner({
          tone: 'ok',
          text: `Merged ${formatNumber(added.length)} new ${plural(added.length, 'rule', 'rules')} from ${file.name} (${doc.entries.length - added.length} already present). Nothing is written until you Save.`,
        });
      }
    } catch (e) {
      this.setBanner({
        tone: 'error',
        text:
          e instanceof SyntaxError
            ? 'That file is not valid JSON - export it from the source site\'s Blocklist page ("Export List").'
            : (e as Error).message,
      });
    } finally {
      this.busy = false;
    }
  };

  exportList = (): void => {
    const doc = serializeBlocklistDocument({
      entries: this.entries,
      envelope: this.envelope,
    });
    const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'content-blocklist.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  save = async (): Promise<void> => {
    this.busy = true;
    this.setBanner(null);
    try {
      const body = await saveBlocklist(this.entries, this.envelope);
      this.listGeneration++;
      const remembered = peek<LoadedBlocklist>(LIST_KEY);
      if (remembered) {
        remember(LIST_KEY, {
          ...remembered,
          entries: $state.snapshot(this.entries),
          envelope: $state.snapshot(this.envelope),
          diagnoses: [],
          collapsed: [],
          repairedCount: 0,
          duplicatesRemoved: 0,
          exists: true,
        });
      }
      this.savedSnapshot = blocklistSnapshot(this.entries);
      this.diagnoses = [];
      this.collapsed = [];
      this.fileExists = true;
      this.setBanner({
        tone: 'ok',
        text: `Saved ${body.count} rules. The previous file is kept as content-blocklist.json.bak.`,
      });
    } catch (e) {
      this.setBanner({ tone: 'error', text: (e as Error).message });
    } finally {
      this.busy = false;
    }
  };

  /**
   * Neptunium filters with its own World Content Blocklist rather than the
   * deployed file, so push the saved on-disk rules to every connected world.
   */
  private pushToWorlds = async (): Promise<{
    text: string;
    failed: boolean;
  }> => {
    const { ready, outdated } = blocklistWorlds(
      (await refreshFoundryStatus()).clients,
    );
    if (!ready.length && !outdated.length) return { text: '', failed: false };
    let rules;
    try {
      rules = toWorldRules((await getBlocklist()).entries);
    } catch (e) {
      return {
        text: `Couldn't read the saved blocklist to send to Foundry: ${(e as Error).message}`,
        failed: true,
      };
    }
    const outcomes: WorldPushOutcome[] = [];
    for (const c of ready) {
      try {
        const r = await sendBlocklistToFoundry(c.clientId, rules);
        outcomes.push({
          world: c.world,
          ok: true,
          count: r.count ?? rules.length,
          changed: r.changed !== false,
        });
      } catch (e) {
        outcomes.push({
          world: c.world,
          ok: false,
          error: (e as Error).message,
        });
      }
    }
    return describeWorldPush(outcomes, outdated);
  };

  deploy = async (): Promise<void> => {
    const wasDirty = this.dirty;
    this.deploying = true;
    this.setBanner(null);
    try {
      const { copied, errors } = await deployHomebrew('content-blocklist.json');
      const where = `${formatNumber(copied.length)} ${plural(copied.length, 'folder', 'folders')}`;
      const worlds = await this.pushToWorlds();
      const after = worlds.text ? ` ${worlds.text}` : '';

      if (errors.length) {
        this.setBanner({
          tone: 'error',
          text:
            [
              copied.length ? `Deployed to ${where}, but:` : 'Deploy failed:',
              ...errors.map((e) => `${e.label}: ${e.message}`),
            ].join(' ') + after,
        });
      } else if (wasDirty) {
        this.setBanner({
          tone: 'warn',
          text: `Deployed the file on disk to ${where} - your unsaved changes were not included. Save, then Deploy again.${after}`,
        });
      } else {
        this.setBanner({
          tone: worlds.failed ? 'warn' : 'ok',
          text: `Deployed content-blocklist.json to ${where}.${after}`,
        });
      }
    } catch (e) {
      this.setBanner({ tone: 'error', text: (e as Error).message });
    } finally {
      this.deploying = false;
    }
  };

  cancel = async (): Promise<void> => {
    this.setBanner(null);
    await this.loadList();
  };

  mount = (): (() => void) => {
    const remembered = peek<LoadedBlocklist>(LIST_KEY);
    void (remembered ? this.refreshList(remembered) : this.loadList());
    const unlisten = onSiteBlocklistAdded(() => void this.absorbSiteRules());
    return () => void unlisten.then((stop) => stop());
  };
}
