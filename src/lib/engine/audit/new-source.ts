/**
 * engine/audit/new-source.ts — the text of an empty brew, ready to fill in.
 *
 * INTENT
 *   The Parser's "New source" button puts this in the editor. It is a `_meta`
 *   with one source and nothing else, so it parses clean and the convert
 *   prompt sees a single source to give every entry. Merge reply then adds the
 *   entry arrays (brew-merge.ts creates a missing one), so none are scaffolded.
 *
 * REUSE NOTES
 *   - Pure. `now` (epoch seconds) is injected, as in mergeIntoBrew.
 *   - Tab-indented like the files in the homebrew repo.
 */

/** Placeholder `json` id of a new source; the user renames it. */
export const NEW_SOURCE_ID = 'MyBrew';

export function buildNewSource(now = Math.floor(Date.now() / 1000)): string {
  const file = {
    _meta: {
      sources: [
        {
          json: NEW_SOURCE_ID,
          abbreviation: NEW_SOURCE_ID,
          full: 'My Brew',
          authors: ['Your Name'],
          convertedBy: ['Your Name'],
          version: '1.0.0',
        },
      ],
      edition: 'classic',
      dateAdded: now,
      dateLastModified: now,
    },
  };
  return JSON.stringify(file, null, '\t') + '\n';
}
