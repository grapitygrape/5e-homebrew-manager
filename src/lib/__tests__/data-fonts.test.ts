import { describe, expect, it, vi } from 'vitest';
import { isFontFileName, loadDataFonts, type DataFont } from '../data-fonts';

const fonts: DataFont[] = [
  { family: 'Modesto Condensed', file: 'here.woff2', weight: '400' },
  { family: 'Modesto Condensed', file: 'empty.woff2', weight: '700' },
  { family: 'Modesto Condensed', file: 'gone.woff2', weight: '700' },
];

const files: Record<string, ArrayBuffer | null> = {
  'here.woff2': new Uint8Array([1, 2]).buffer,
  'empty.woff2': new ArrayBuffer(0),
  'gone.woff2': null,
};

describe('loadDataFonts', () => {
  it('adds only the fonts that have bytes, and skips the rest quietly', async () => {
    const add = vi.fn(async () => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = await loadDataFonts(async (f) => files[f], add, fonts);
    expect(loaded).toEqual(['here.woff2']);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(fonts[0], files['here.woff2']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a font that fails to load is warned about, and the others still load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loaded = await loadDataFonts(
      async () => new Uint8Array([1]).buffer,
      async (font) => {
        if (font.file === 'empty.woff2') throw new Error('bad font');
      },
      fonts,
    );
    expect(loaded.sort()).toEqual(['gone.woff2', 'here.woff2']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('isFontFileName', () => {
  it('takes a bare .woff2 name and nothing else', () => {
    expect(isFontFileName('modesto-condensed.woff2')).toBe(true);
    for (const name of ['../x.woff2', '..\\x.woff2', 'a/b.woff2', 'README.md', '.woff2'])
      expect(isFontFileName(name), name).toBe(false);
  });
});
