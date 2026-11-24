// svelte.config.js — Svelte 5 + SvelteKit.
//
// Two builds, picked per run:
//   - Web (`npm run build`): adapter-node. The server routes stay so the
//     manager can be reached from other machines on the LAN, and the Foundry
//     bridge runs in SvelteKit.
//   - Desktop (`npm run tauri:build`): adapter-static as a single-page app.
//     Pages load through lib/api, which calls Tauri commands, so no server is
//     needed. Nothing is prerendered, and SvelteKit renders the fallback page
//     with SSR off. Tauri serves index.html for any path it can't find, so
//     deep links work.
//
// The Tauri CLI sets TAURI_ENV_PLATFORM for its beforeBuildCommand. To try the
// desktop build without Tauri, set it yourself before `npm run build`.
import nodeAdapter from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const desktop = Boolean(process.env.TAURI_ENV_PLATFORM);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: desktop
      ? staticAdapter({ fallback: 'index.html' })
      : nodeAdapter(),
  },
};

export default config;
