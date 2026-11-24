import { describe, expect, it, vi } from 'vitest';
import {
  isSiteIconFile,
  loadSiteIcons,
  withoutFontFaces,
  type SiteIconFile,
} from '../site-icons';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;

const SITE_CSS =
  '.fa{--_fa-family:"Font Awesome 7 Pro"}' +
  '@font-face{font-family:"Font Awesome 7 Pro";src:url(../fonts/fontawesome/fa-solid-900.woff2)}' +
  '.fa-books{--fa:"\\f5db"}' +
  '@font-face { font-family: "FontAwesome"; src: url(../fonts/fontawesome/fa-v4compatibility.woff2) }';

describe('withoutFontFaces', () => {
  it('drops every @font-face and keeps the other rules', () => {
    expect(withoutFontFaces(SITE_CSS)).toBe(
      '.fa{--_fa-family:"Font Awesome 7 Pro"}.fa-books{--fa:"\\f5db"}',
    );
  });
});

describe('isSiteIconFile', () => {
  it('accepts only the two file keys', () => {
    expect(isSiteIconFile('css')).toBe(true);
    expect(isSiteIconFile('font')).toBe(true);
    for (const name of ['toString', '../css', 'css/fontawesome.css', ''])
      expect(isSiteIconFile(name), name).toBe(false);
  });
});

describe('loadSiteIcons', () => {
  const site: Record<SiteIconFile, ArrayBuffer> = {
    css: bytes(SITE_CSS),
    font: new Uint8Array([1, 2]).buffer,
  };

  it("applies the site's CSS without font faces, and its font", async () => {
    const apply = vi.fn(async () => {});
    expect(await loadSiteIcons(async (f) => site[f], apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith(withoutFontFaces(SITE_CSS), site.font);
  });

  it('keeps the Free icons when either file is missing or empty', async () => {
    const apply = vi.fn(async () => {});
    const cases: Partial<Record<SiteIconFile, ArrayBuffer | null>>[] = [
      { css: null, font: site.font },
      { css: site.css, font: null },
      { css: site.css, font: new ArrayBuffer(0) },
    ];
    for (const files of cases)
      expect(await loadSiteIcons(async (f) => files[f] ?? null, apply)).toBe(
        false,
      );
    expect(apply).not.toHaveBeenCalled();
  });

  it('warns and keeps the Free icons when reading or applying fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await loadSiteIcons(
        async () => {
          throw new Error('no checkout');
        },
        async () => {},
      ),
    ).toBe(false);
    expect(
      await loadSiteIcons(
        async (f) => site[f],
        async () => {
          throw new Error('bad font');
        },
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
