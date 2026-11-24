/** Tests for engine/audit/new-source.ts — the scaffold behind "New source". */
import { describe, it, expect } from 'vitest';
import { buildNewSource, NEW_SOURCE_ID } from '../audit/new-source.ts';
import { mergeIntoBrew, parseModelReply } from '../audit/brew-merge.ts';
import { buildConvertPrompt } from '../audit/convert-prompt.ts';

describe('buildNewSource', () => {
  it('is a JSON object with one declared source and no entry arrays', () => {
    const doc = JSON.parse(buildNewSource(1700000000));
    expect(Object.keys(doc)).toEqual(['_meta']);
    expect(doc._meta.sources).toHaveLength(1);
    expect(doc._meta.sources[0].json).toBe(NEW_SOURCE_ID);
    expect(doc._meta.dateAdded).toBe(1700000000);
  });

  it('is tab-indented and ends with a newline', () => {
    const text = buildNewSource(1);
    expect(text).toMatch(/^\{\n\t"_meta"/);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('takes a reply without a warning and keeps its own _meta', () => {
    const reply = parseModelReply(
      JSON.stringify({ spell: [{ name: 'A', source: NEW_SOURCE_ID }] }),
    );
    const r = mergeIntoBrew(buildNewSource(1700000000), reply);
    const doc = JSON.parse(r.text);
    expect(doc.spell).toHaveLength(1);
    expect(doc._meta.sources[0].json).toBe(NEW_SOURCE_ID);
    expect(r.warnings).toEqual([]);
  });

  it('gives the convert prompt one source to use', () => {
    const prompt = buildConvertPrompt({
      source: 'x',
      file: 'Untitled.json',
      doc: JSON.parse(buildNewSource(1)),
      paths: {},
    });
    expect(prompt).toContain(`Source: \`${NEW_SOURCE_ID}\``);
  });
});
