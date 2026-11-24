/** lib/api/site-icons.ts — swap in the site's Pro icons; see lib/site-icons. */
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri-core';
import {
  SITE_ICON_FAMILY,
  loadSiteIcons,
  type SiteIconFile,
} from '$lib/site-icons';

async function readOverHttp(file: SiteIconFile): Promise<ArrayBuffer | null> {
  const res = await fetch(`/api/site-icons/${file}`);
  return res.ok ? res.arrayBuffer() : null;
}

/**
 * Use the site's icons if its checkout has them. Safe to call again, such as
 * after setup downloads the checkout.
 */
export function useSiteIcons(): Promise<boolean> {
  const read = isTauri()
    ? (file: SiteIconFile) =>
        invoke<ArrayBuffer>('read_site_icon_file', { file })
    : readOverHttp;
  return loadSiteIcons(read, async (css, font) => {
    const face = new FontFace(SITE_ICON_FAMILY, font, { weight: '400' });
    await face.load();
    document.fonts.add(face);
    let style = document.getElementById('site-icons');
    if (!style) {
      style = document.createElement('style');
      style.id = 'site-icons';
      document.head.append(style);
    }
    style.textContent = css;
    for (const link of document.querySelectorAll('link[data-icons-free]'))
      link.remove();
    document.documentElement.classList.add('site-icons');
  });
}
