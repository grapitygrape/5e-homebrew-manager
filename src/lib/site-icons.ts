/**
 * lib/site-icons.ts — the app's icons: Font Awesome Free until the site's
 * Pro icons are there.
 *
 * INTENT
 *   The app can ship only Font Awesome Free. The Tools source checkout carries
 *   Font Awesome Pro, so once it exists the app reads that copy's CSS and its
 *   Sharp Duotone font instead: through a Tauri command on the desktop,
 *   through /api/site-icons on the Node server. Until then, or if either file
 *   is missing, the bundled Free icons stay (app.css maps the Pro-only names).
 */

/** The files the app reads, by path in the Tools source checkout. */
export const SITE_ICON_FILES = {
  css: 'css/fontawesome.css',
  font: 'fonts/fontawesome/fa-sharp-duotone-regular-400.woff2',
} as const;

export type SiteIconFile = keyof typeof SITE_ICON_FILES;

export function isSiteIconFile(name: string): name is SiteIconFile {
  return Object.hasOwn(SITE_ICON_FILES, name);
}

/** The family app.css's `.site-icons` rules ask for. */
export const SITE_ICON_FAMILY = 'Font Awesome 7 Sharp Duotone';

/**
 * The site's CSS without its @font-face rules. Their URLs are relative to the
 * site, and the one face the app uses is registered from bytes instead.
 */
export function withoutFontFaces(css: string): string {
  return css.replace(/@font-face\s*\{[^}]*\}/g, '');
}

/**
 * Switch to the site's icons when both files have bytes. `read` returns null
 * or an empty buffer for a missing file. Returns whether it switched.
 */
export async function loadSiteIcons(
  read: (file: SiteIconFile) => Promise<ArrayBuffer | null>,
  apply: (css: string, font: ArrayBuffer) => Promise<void>,
): Promise<boolean> {
  try {
    const [css, font] = await Promise.all([read('css'), read('font')]);
    if (!css?.byteLength || !font?.byteLength) return false;
    await apply(withoutFontFaces(new TextDecoder().decode(css)), font);
    return true;
  } catch (err) {
    console.warn("The site's icons didn't load, so the Free ones stay:", err);
    return false;
  }
}
