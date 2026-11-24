/**
 * lib/data-fonts.ts — the licensed fonts the app's own pages use.
 *
 * INTENT
 *   Modesto Condensed can't ship with the app, so it lives in the data
 *   folder's fonts/ and is loaded at startup: through a Tauri command on the
 *   desktop, through /api/data-font on the Node server. A missing file is
 *   skipped, and app.css's stack falls back to the bundled Nodesto.
 */

export interface DataFont {
  family: string;
  file: string;
  weight: string;
}

export const DATA_FONTS: DataFont[] = [
  { family: 'Modesto Condensed', file: 'modesto-condensed.woff2', weight: '400' },
  { family: 'Modesto Condensed', file: 'modesto-condensed-bold.woff2', weight: '700' },
];

/** A bare .woff2 name, so the route can't be used to read other files. */
export function isFontFileName(name: string): boolean {
  return !/[\\/]/.test(name) && !name.startsWith('.') && name.endsWith('.woff2');
}

/**
 * Add each font whose file has bytes. `read` returns null or an empty buffer
 * for a missing file. Returns the files that loaded.
 */
export async function loadDataFonts(
  read: (file: string) => Promise<ArrayBuffer | null>,
  add: (font: DataFont, bytes: ArrayBuffer) => Promise<void>,
  fonts: DataFont[] = DATA_FONTS,
): Promise<string[]> {
  const loaded: string[] = [];
  await Promise.all(
    fonts.map(async (font) => {
      try {
        const bytes = await read(font.file);
        if (!bytes?.byteLength) return;
        await add(font, bytes);
        loaded.push(font.file);
      } catch (err) {
        console.warn(`Font ${font.file} from the data folder didn't load:`, err);
      }
    }),
  );
  return loaded;
}
