/** lib/api/fonts.ts — load the data folder's fonts into the app's pages. */
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri-core';
import { loadDataFonts } from '$lib/data-fonts';

async function readOverHttp(file: string): Promise<ArrayBuffer | null> {
  const res = await fetch(`/api/data-font/${encodeURIComponent(file)}`);
  return res.ok ? res.arrayBuffer() : null;
}

/** Register the data folder's fonts with the document; see lib/data-fonts. */
export function loadAppFonts(): Promise<string[]> {
  const read = isTauri()
    ? (file: string) => invoke<ArrayBuffer>('read_data_font', { name: file })
    : readOverHttp;
  return loadDataFonts(read, async (font, bytes) => {
    const face = new FontFace(font.family, bytes, {
      weight: font.weight,
      display: 'swap',
    });
    await face.load();
    document.fonts.add(face);
  });
}
