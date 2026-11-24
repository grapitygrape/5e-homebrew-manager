/**
 * Tests for cascade-edit.ts — the one path every blocklist rule edit takes
 * when the parent may have children to carry along.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeForHash, entryKey } from '$lib/engine/blocklist';
import type { BlocklistEntry, IndexedEntity } from '$lib/engine/blocklist';
import type { CascadeChoice, CascadePrompt } from '../blocklist-model.ts';

vi.mock('$lib/api', () => ({ getBlocklistChildren: vi.fn() }));
const { getBlocklistChildren } = await import('$lib/api');
const { cascadeEdit, cascadeBannerText } = await import('../cascade-edit.ts');

const ent = (prop: string, name: string, source: string): IndexedEntity => ({
  prop,
  name,
  source,
  hash: encodeForHash(name, source),
});

const rule = (e: { hash: string; prop: string; source: string; name: string }): BlocklistEntry => ({
  displayName: e.name,
  hash: e.hash,
  category: e.prop,
  source: e.source,
  isAuto: false,
});

const artificer = ent('class', 'Artificer', 'TCE');
const alchemist = ent('subclass', 'Alchemist', 'TCE');
const maverick = ent('subclass', 'Maverick', 'HB');
const other = ent('spell', 'Fireball', 'PHB');

const parentRule = rule(artificer);
const keys = (list: BlocklistEntry[]) => list.map(entryKey);

beforeEach(() => {
  vi.mocked(getBlocklistChildren).mockReset();
  vi.mocked(getBlocklistChildren).mockResolvedValue([alchemist, maverick]);
});

function block(
  current: () => BlocklistEntry[],
  confirm?: (p: CascadePrompt) => Promise<CascadeChoice>,
  onwarn?: (text: string) => void,
) {
  return cascadeEdit({
    mode: 'block',
    target: parentRule,
    current,
    change: (list) => [...list, parentRule],
    confirm,
    onwarn,
  });
}

describe('cascadeEdit', () => {
  it('adds the parent and the chosen children once each', async () => {
    const entries = [rule(alchemist)];
    const confirm = vi.fn(async (_p: CascadePrompt): Promise<CascadeChoice> => 'all');
    const res = await block(() => entries, confirm);

    // Alchemist is already blocked, so only Maverick is offered.
    expect(confirm.mock.calls[0][0].children).toEqual([maverick]);
    expect(keys(res!.entries)).toEqual(keys([rule(alchemist), parentRule, rule(maverick)]));
    expect(cascadeBannerText(res!)).toBe(
      'Blocked Artificer (TCE) along with 1 subclass - nothing is written until you Save.',
    );
  });

  it('keeps edits made while the prompt was open', async () => {
    let entries: BlocklistEntry[] = [];
    const res = await block(
      () => entries,
      async () => {
        // The rules pane changes the list while the dialog is up.
        entries = [rule(other)];
        return 'all';
      },
    );
    expect(keys(res!.entries)).toEqual(
      keys([rule(other), parentRule, rule(alchemist), rule(maverick)]),
    );
  });

  it("changes only the parent on 'parent' and nothing on 'cancel'", async () => {
    const parentOnly = await block(() => [], async () => 'parent');
    expect(keys(parentOnly!.entries)).toEqual(keys([parentRule]));
    expect(cascadeBannerText(parentOnly!)).toBeNull();

    expect(await block(() => [], async () => 'cancel')).toBeNull();
  });

  it('skips the prompt when no child needs a change', async () => {
    const confirm = vi.fn(async (_p: CascadePrompt): Promise<CascadeChoice> => 'all');
    const res = await block(() => [rule(alchemist), rule(maverick)], confirm);
    expect(confirm).not.toHaveBeenCalled();
    expect(res!.cascaded).toEqual([]);
  });

  it('warns and applies the parent alone when the lookup fails', async () => {
    vi.mocked(getBlocklistChildren).mockRejectedValueOnce(new Error('index gone'));
    const onwarn = vi.fn();
    const res = await block(() => [], async () => 'all', onwarn);
    expect(onwarn).toHaveBeenCalledWith('Could not check related children: index gone');
    expect(keys(res!.entries)).toEqual(keys([parentRule]));
  });
});
