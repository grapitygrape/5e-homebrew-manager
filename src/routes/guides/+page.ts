/**
 * Guides load — the Overview (dashboard-service: workspace status + the
 * guide-coverage audit) and the sidebar lists for the two document types in
 * the guides folder: conversion "Guides" (GUIDE_MAP, schema-backed, validator
 * available) and "Documentation" (DOC_MAP — reference material with no entity
 * schema). Guide bodies + schema are fetched client-side as the user selects
 * them, so this stays light.
 *
 * Client-only, so the load always goes through lib/api and the desktop shell
 * reads the guides itself instead of asking the Node server.
 */
import type { PageLoad } from './$types';
import { getDashboard, listGuides } from '$lib/api';
import { cachedLoad } from '$lib/state/page-cache.svelte.ts';

export const ssr = false;

export interface GuideListing {
  file: string;
  label: string;
  /** Conversion guides get the JSON validator; docs don't. */
  isGuide: boolean;
}

export const load: PageLoad = ({ depends }) =>
  cachedLoad('guides', depends, readGuides);

async function readGuides() {
  // A failed Overview shouldn't take the guide list down with it.
  const [entries, overview] = await Promise.all([
    listGuides().catch(() => []),
    getDashboard().catch(() => null),
  ]);

  const guides: GuideListing[] = [];
  const docs: GuideListing[] = [];
  for (const { file, label, group } of entries) {
    (group === 'guide' ? guides : docs).push({
      file,
      label,
      isGuide: group === 'guide',
    });
  }

  const byLabel = (a: GuideListing, b: GuideListing) =>
    a.label.localeCompare(b.label);
  return {
    overview,
    guides: guides.sort(byLabel),
    docs: docs.sort(byLabel),
  };
}
