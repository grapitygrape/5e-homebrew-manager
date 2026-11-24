/**
 * One blocklist edit on a parent rule, carried to its structural children
 * (subclasses, race variants, derived items, cards, summons) when the user
 * agrees. Every place that adds or removes a rule goes through here.
 */
import { getBlocklistChildren } from '$lib/api';
import {
  applyCascade,
  cascadeCandidates,
  describeChildSummary,
  describeTargetLabel,
} from '$lib/engine/blocklist';
import type {
  BlocklistEntry,
  CascadeMode,
  IndexedEntity,
  TargetRuleSpec,
} from '$lib/engine/blocklist';
import type { ConfirmCascade } from './blocklist-model.ts';

export interface CascadeEditResult {
  mode: CascadeMode;
  entries: BlocklistEntry[];
  /** Children changed along with the parent; empty when only the parent changed. */
  cascaded: IndexedEntity[];
  parentLabel: string;
}

/**
 * Apply `change` (the parent edit) and, if the user agrees, the same edit to
 * the parent's children. `change` runs again on the entries current once the
 * lookup and prompt finish, so edits made meanwhile aren't overwritten.
 * Resolves null when the user cancels.
 */
export async function cascadeEdit(opts: {
  mode: CascadeMode;
  target: TargetRuleSpec;
  current: () => BlocklistEntry[];
  change: (entries: BlocklistEntry[]) => BlocklistEntry[];
  confirm?: ConfirmCascade;
  onwarn?: (text: string) => void;
}): Promise<CascadeEditResult | null> {
  const { mode, target, current, change, confirm, onwarn } = opts;
  const parentLabel = describeTargetLabel(target);

  let children: IndexedEntity[] = [];
  if (confirm) {
    try {
      const all = await getBlocklistChildren(
        target.source,
        target.category,
        target.hash,
      );
      children = cascadeCandidates(mode, all, change(current()));
    } catch (e) {
      onwarn?.(`Could not check related children: ${(e as Error).message}`);
    }
  }

  let cascaded: IndexedEntity[] = [];
  if (children.length && confirm) {
    const choice = await confirm({ mode, parentLabel, children });
    if (choice === 'cancel') return null;
    if (choice === 'all') cascaded = children;
  }

  return {
    mode,
    entries: applyCascade(mode, change(current()), cascaded),
    cascaded,
    parentLabel,
  };
}

/** Banner text for a cascaded edit, or null when only the parent changed. */
export function cascadeBannerText(res: CascadeEditResult): string | null {
  if (!res.cascaded.length) return null;
  const what = describeChildSummary(res.cascaded);
  return res.mode === 'block'
    ? `Blocked ${res.parentLabel} along with ${what} - nothing is written until you Save.`
    : `Removed ${res.parentLabel} and ${what} from the blocklist - nothing is written until you Save.`;
}
