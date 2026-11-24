# 5e homebrew customizer

A replacement for homebrew tools' page shell (templates, layout CSS, nav and filter styling)
that keeps upstream's engine. `npm run export` packages it into `patch-deploy/` in this
folder, for the homebrew manager's "Reskin the site" deploy module. The manager runs
`npm run export -- --worktree` itself before every Apply customizations and Prepare (the
module's `build` in `deploy-modules/reskin/module.json`), so the site checkout's current
state, committed or not, is what gets applied.

This folder lives in `5e-homebrew-manager` and holds only our code. Upstream's data,
images, audio and homebrew never go in it. Our edits to upstream's own files live in `upstream.patch`, built on the upstream
commit in `upstream.json`.

## The site

The site is an ordinary checkout of the homebrew tools repo, by default a `homebrew-tools`
folder beside the manager. That's where upstream's files are edited, rebased and
served from. It's local only: never push it.

Every script finds the site by checking, in order, the `HBM_SITE` environment variable,
`local.json` (written by setup, not committed), then `homebrew-tools` beside the manager.

The other folders come from the manager:

- **Tools source** (Settings > Repos, in its `hbm-config.json`): images and homebrew are
  served from here, and setup copies git objects from it. Older configs without repos use
  the folder above **Source data** (Settings > Sources). If neither is set, `5e` beside the
  manager is used.
- **Data folder**: the folder holding `hbm-config.json`. It's what `{data}` means in
  deploy modules, and the licensed fonts come from its `fonts/`.

 Build sibling paths in `scripts/paths.mjs`, never as `../5e` in a script: from here
that would land in the manager's own untracked `5e/` folder.

## Setup

```powershell
npm run setup -- ..\..\homebrew-tools   # adopt an existing checkout, or create one there
npm run setup                          # asks for the folder; Enter keeps the saved one
```

- **The folder is already an upstream checkout:** setup checks that it matches
  `upstream.patch`, then saves its path. If it doesn't match, setup lists the files that
  differ and changes nothing. Run `npm run save-patch` to keep the site's version.
- **The folder doesn't exist:** setup clones upstream there, copying objects from
  the Tools source when it can rather than downloading them. It checks out the commit in
  `upstream.json` on a branch `hbm`, applies the patch, runs `npm install` and builds.
  The patch is left uncommitted; commit it in the site before your first rebase.

`--skip-install` and `--skip-build` skip those steps.

## Run it

```powershell
npm run serve        # http://localhost:5175/
npm run build        # regenerate the site's pages, search index and CSS
npm run save-patch   # after editing upstream files in the site
npm run export       # write patch-deploy\ for the manager's Reskin module
npm test             # unit tests for scripts/ and shell/
npm run verify       # stylelint, tests, every page at three widths, click-through flows
```

For a quick check, run only the pages a change touches:
`node shell/check.mjs --pages=spells,classes --widths=1920,390`.

Open pages through the server, not by double-clicking the .html files. Over `file://` the
browser blocks the JS modules and JSON, so every page fails with errors like
`PageFilterBase is not defined`.

`verify` and `check` need the server running. Editing `shell/*.css` only needs a reload.

The dev server reads `img/`, `homebrew-img/` and `homebrew/` from the Tools source, and the
assets from their sources (see Assets). It answers `sw.js` with a worker that does nothing, so CSS is never
served stale.

## Assets

The shell needs some files upstream doesn't ship. `ASSET_SOURCES` in `scripts/paths.mjs`
maps each site path to its source. The fonts are licensed, so they stay out of git and live
in the manager's data folder; its `fonts/README.md` lists them.

| Site path | Where it comes from |
| --- | --- |
| `watercolor-light.webp`, `watercolor-dark.webp` | `assets/`, committed |
| `paper_fibers_light.webp`, `paper_fibers_dark.webp` | `assets/`, committed |
| `fonts/majesty-bold.woff2`, `fonts/majesty-black.woff2` | `fonts/` in the data folder |
| `hbm/modesto-condensed/modesto-condensed.woff2` | `fonts/modesto-condensed.woff2` in the data folder |
| `hbm/nodesto/` | `deploy-modules/_shared/nodesto/`, the fallback when a font above is missing |

Setup lists any that are missing, and export skips them.

## What's where

| Path | What it is |
| --- | --- |
| `shell/tokens.css` | Spacing, type and colour tokens, light and night. Upstream's root font is 10px, so 1rem is 10px. |
| `shell/primitives.css` | Reusable layout: `.layout-stack`, `.layout-cluster`, `.layout-panes` |
| `shell/app-bar.css` | The one-row title, nav and search bar |
| `shell/menus.css` | Every menu: the app bar's dropdowns and the ? / right-click context menus share one look |
| `shell/list-page.css` | The two-pane list pages, which stack on container width |
| `shell/detail-bar.css` | The flat bar above each entry: its tabs, page actions and pin buttons in one row. Also flat tabs site-wide. |
| `shell/controls.css` | The one frame (height, border, corner) every control shares, plus button rows: icon-only buttons as squares, adjacent text buttons joined into strips. Add a new bar's selector to its lists rather than restyling buttons locally. |
| `shell/book-page.css` | Book and adventure pages: contents sidebar that widens with the window, chevron toggles, the chapter bar, the floating Previous / Next / Top buttons, and the books and adventures index: a collapsible table beside framed covers |
| `shell/panels.css` | Stat blocks, class sections, book text and hover previews: one 1px border, a background, 0.5rem padding |
| `shell/bestiary.css` | The bestiary's pinned list (one column grid for header and rows, add/remove buttons, the Total and Clear footer) and the encounter builder's section cards and fields |
| `shell/filters.css` | Filter summary pills and filter dialog spacing |
| `shell/icons.css` | Points upstream's Glyphicon classes at Font Awesome solid. A Glyphicon not listed there shows the wrong glyph, so add new ones. The filter summary toggle shows `filter` or `filter-slash`, and swaps to the other on hover. |
| `shell/view-mode.css` | Player view: hides anything marked `dm-only`, and styles the home page's "I'm a DM / I'm a player" prompt. The setting itself is `ViewMode` in `js/navigation.js`. Upstream's `.ve-flex` and `.ve-block` are still `!important`, so put `dm-only` on an element without them. |
| `shell/tooltips.js`, `shell/tooltips.css` | Shows `title` text at once instead of after the browser's delay |
| `shell/omni-complete.js`, `shell/omni-complete.css` | Suggestions for the search box's `in:` and `source:` syntax, built from upstream's search index. Reads `OmnisearchBacking`'s private `_pInit`, `_CATEGORY_COUNTS`, `_IN_CATEGORY_ALIAS` and `_searchIndex`, so recheck it after an upstream update; if they're renamed the menu just doesn't appear. |
| `shell/theme.css` | The custom look over upstream's content: fonts, link colours, headings, boxed text, home page. |
| `shell/overrides/` | A copy of the hand-written home page. `build.mjs` moves it onto the shell. |
| `shell/bundle.mjs` | Bundles `shell/*.css` into `css/shell.css`, rewriting `url()`s to resolve from `css/` |
| `shell/modules-overlay.mjs` | Applies the manager's enabled deploy modules in memory as the dev server serves files |
| `shell/export.mjs` | Writes `patch-deploy/` (`reskin.patch` and `site/`) for the manager's Reskin module. It stays out of the site and the Tools source: Prepare cleans the Tools source, and Deploy mirrors it to the live site. |
| `scripts/paths.mjs` | Where the site, assets, patch and the manager's Settings folders are. Every script gets its paths here. |
| `scripts/setup.mjs` | Adopts or creates the site and saves its path in `local.json` |
| `scripts/save-patch.mjs`, `scripts/patch.mjs` | Write `upstream.patch` and `upstream.json` from the site |
| `upstream.patch` | Our edits to upstream's `js/`, `node/` (templates included), `scss/` and `.gitignore` |
| `upstream.json` | The upstream commit the patch is built on |
| `UPSTREAM-LICENSE.md` | Upstream's MIT notice, which the patch must carry |
| `scripts/ad-slots.mjs` | Finds upstream's ad slots (it calls them "cancer") and the ad network's consent box and scripts. `save-patch` refuses a patch that adds any, and `build` fails if a page still has them. |
| `assets/` | The textures (committed) and fonts (local only) the shell uses (see Assets) |

## Reusable controls

`shell/controls.css` gives every button, button group and badge one look. New markup opts in
with a class, so no selector list needs editing:

| Class | Put it on | What it does |
| --- | --- | --- |
| `control-bar` | Any wrapper | Its `.ve-btn`s get the shared frame, fill and hover. Icon-only buttons become squares, `.ve-btn-group`s become joined strips, and `.ve-form-control` inputs get the frame. |
| `tag-badge` | A `span`, `a` or `button` | A 2rem framed tag. Button badges get a hover, and `.ve-active` marks a selected one. |

Upstream containers that we can't add a class to are listed in the same rules instead, such
as `.detail-bar` and the filter dialog's hook classes. Upstream chips that should look like
badges, like the subclass toggles and the pick dialog's pills, join the badge rule's list.

## How the cascade works

Upstream's CSS is in `@layer vetools`, and shell CSS is unlayered, so it wins without
`!important`. `theme.css` sits between them in `@layer shell-theme`: it beats upstream
whatever its selectors, and any other shell rule beats it. The spacing utilities used to be `!important`, which nothing outside the
layer could beat. They now sit in `@layer vetools-utilities` without it. That still beats
all of `vetools`, but shell CSS can override it.

## Updating from upstream

The site carries upstream's history with our commits on top, so updates come in by
rebasing there. `npm run upstream:update` in the manager does the steps below when no
conflict needs a person; the steps are for when it stops. Don't hard-reset the checkout: that would
wipe the edits that aren't saved in the patch yet.

1. In the site, commit everything first. A rebase needs a clean tree.
2. Fetch and rebase:

   ```powershell
   git fetch upstream
   git rebase upstream/main
   ```

3. Resolve conflicts by source, not by hand:
   - `css/*.css` is minified sass output, so it conflicts whenever both sides touched SCSS.
     Compile the merged SCSS over it, for example
     `npx sass --style=compressed scss/main.scss css/main.css`, then stage that file.
   - Generated `.html` pages and `search/*.json`: take either side, then let
     `npm run build` (step 4) regenerate them.
   - JS, templates and SCSS: merge by hand. Most of our JS edits only add a class.

   Then `git add` the resolved files and run `git rebase --continue`.
4. In this repo, run `npm run build`. It should change nothing in the site. If it does,
   a generated file was resolved wrong, so fix it there and commit the fix. If it reports
   ad slot markup, upstream added a new slot: delete it from the template in the site.
5. Check the pages whose JS both sides changed, with the server running:
   `node shell/check.mjs --pages=classes,bestiary,spells,items --widths=1920,390`.
   A 404 for a new book's image just means the Tools source hasn't pulled that image yet.
6. Run `npm run save-patch`, and commit `upstream.patch` and `upstream.json` here.
7. Run `npm run export` so the manager has a package built for the new upstream commit.

## Not done

- Tool pages (DM Screen, statgen, makebrew and similar) get the new bar and full width,
  but their insides are still upstream's layout.
- The filter dialog only has spacing changes. Its markup comes from `FilterBox` in JS.

## Credits and licenses

- `upstream.patch` and the generator code it edits come from the homebrew tools repo
  named in `upstream.json`, MIT licensed. Its notice is in `UPSTREAM-LICENSE.md`; keep
  it with the patch.
- No Font Awesome files are committed. `shell/icons.css` maps Glyphicons to codepoints
  in the Font Awesome copy upstream ships (`css/fontawesome.css`, `fonts/fontawesome/`).
- Upstream's ads and the ad network's consent box are removed, and `scripts/ad-slots.mjs`
  stops them coming back. The privacy policy page is kept, with upstream's wording.
