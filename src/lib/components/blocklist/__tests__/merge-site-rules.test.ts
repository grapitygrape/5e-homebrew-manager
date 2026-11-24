/**
 * Tests for mergeSiteRules — rules added in the site browser joining the
 * Choose Content page's unsaved edits.
 */
import { describe, it, expect } from 'vitest';
import type { BlocklistEntry } from '$lib/engine/blocklist';
import { mergeSiteRules } from '../blocklist-model.ts';

const rule = (hash: string, category: string, source: string): BlocklistEntry => ({
  displayName: hash,
  hash,
  category,
  source,
  isAuto: false,
});

const names = (list: BlocklistEntry[]) => list.map((e) => `${e.hash}|${e.category}|${e.source}`);

describe('mergeSiteRules', () => {
  it('adds rules the list does not have', () => {
    const res = mergeSiteRules([rule('rope_phb', 'item', 'PHB')], [rule('lamp_phb', 'item', 'PHB')]);
    expect(names(res.entries)).toEqual(['rope_phb|item|PHB', 'lamp_phb|item|PHB']);
    expect(res).toMatchObject({ added: 1, skipped: 0 });
  });

  it('skips a rule already present, whatever its case', () => {
    const res = mergeSiteRules([rule('rope_phb', 'item', 'PHB')], [rule('Rope_PHB', 'item', 'phb')]);
    expect(res.entries).toHaveLength(1);
    expect(res).toMatchObject({ added: 0, skipped: 1 });
  });

  it('skips a rule a broader one already blocks', () => {
    const current = [rule('*', '*', 'XGE'), rule('*', 'spell', 'TCE')];
    const res = mergeSiteRules(current, [
      rule('toll%20the%20dead_xge', 'spell', 'XGE'),
      rule('mind%20sliver_tce', 'spell', 'TCE'),
      rule('artificer_tce', 'class', 'TCE'),
    ]);
    expect(names(res.entries).slice(2)).toEqual(['artificer_tce|class|TCE']);
    expect(res).toMatchObject({ added: 1, skipped: 2 });
  });

  it('adds a repeated rule in the same send only once', () => {
    const res = mergeSiteRules([], [rule('rope_phb', 'item', 'PHB'), rule('rope_phb', 'item', 'PHB')]);
    expect(res).toMatchObject({ added: 1, skipped: 1 });
  });
});
