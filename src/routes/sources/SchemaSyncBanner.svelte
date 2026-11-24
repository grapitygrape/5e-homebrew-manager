<!--
  SchemaSyncBanner — Version check panel in `/sources`: checks whether
  5etools-utils schemas match 5e/package.json and whether 5e-homebrew is ahead
  of 5e's commit date, with one-click fixes for each.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import PanelHead from '$lib/ui/PanelHead.svelte';
  import type { RepoStatus, SchemaSyncReport } from '$lib/api';
  import { formatGitDay } from '$lib/state/sources-page.svelte.ts';
  import { plural } from '$lib/util';

  interface Props {
    schema: SchemaSyncReport;
    site: RepoStatus | null;
    homebrewAnchored: boolean;
    busy: boolean;
    onSyncUtils: () => void;
    onSyncHomebrew: () => void;
  }

  let {
    schema,
    site,
    homebrewAnchored,
    busy,
    onSyncUtils,
    onSyncHomebrew,
  }: Props = $props();
</script>

{#snippet check(
  ok: boolean,
  unknown: boolean,
  title: string,
  text: string,
  note: boolean,
)}
  <div class="version-check-row">
    <i
      class={[
        'version-check-glyph fa-sharp-duotone fa-regular',
        unknown
          ? 'fa-circle-question'
          : ok
            ? 'fa-circle-check version-check-ok'
            : note
              ? 'fa-circle-info'
              : 'fa-triangle-exclamation version-check-warn',
      ]}
      aria-hidden="true"
    ></i>
    <div>
      <strong class="version-check-title">{title}</strong>
      <p class="version-check-text">{text}</p>
    </div>
  </div>
{/snippet}

<Panel>
  <PanelHead>
    <h2>Version check</h2>
  </PanelHead>
  <div class="version-check">
    {@render check(
      schema.status === 'synced',
      schema.status === 'unknown',
      'Brew schemas match the site',
      schema.status === 'synced'
        ? `5etools-utils v${schema.actualUtilsVersion} is the version 5e v${schema.siteVersion} asks for.`
        : schema.message,
      false,
    )}
    {#if schema.status !== 'synced' && schema.status !== 'unknown'}
      <Button variant="primary" disabled={busy} onclick={onSyncUtils}>
        Match to 5e
      </Button>
    {/if}

    {@render check(
      schema.homebrewCommitsAfter5e === 0,
      !site?.commitTimestamp,
      "Homebrew isn't newer than the site",
      schema.homebrewCommitsAfter5e === 0
        ? `5e-homebrew has nothing newer than 5e's commit from ${formatGitDay(site?.commitTimestamp ?? 0)}.`
        : homebrewAnchored
          ? `5e-homebrew has ${schema.homebrewCommitsAfter5e} ${plural(schema.homebrewCommitsAfter5e, 'commit', 'commits')} newer than 5e's commit from ${formatGitDay(site?.commitTimestamp ?? 0)}. The next Prepare checks it out at 5e's date.`
          : `5e-homebrew has ${schema.homebrewCommitsAfter5e} ${plural(schema.homebrewCommitsAfter5e, 'commit', 'commits')} newer than 5e's commit from ${formatGitDay(site?.commitTimestamp ?? 0)}. That's usually fine; a brew may now and then use something the site doesn't have yet.`,
      !homebrewAnchored,
    )}
    {#if schema.homebrewCommitsAfter5e > 0}
      <Button
        variant={homebrewAnchored ? 'primary' : 'outlined'}
        disabled={busy}
        onclick={onSyncHomebrew}
      >
        Roll back to 5e's date
      </Button>
    {/if}
  </div>
</Panel>

<style>
  .version-check {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-4) var(--space-5);
    align-items: center;
  }

  .version-check-row {
    display: flex;
    grid-column: 1;
    gap: var(--space-3);
    align-items: baseline;
  }

  .version-check-glyph {
    color: var(--text-faint);
  }

  .version-check-ok {
    color: var(--ok);
  }

  .version-check-warn {
    color: var(--warn);
  }

  .version-check-title {
    font-weight: var(--font-weight-semibold);
  }

  .version-check-text {
    margin: var(--hm-space-0-5) 0 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  @media (max-width: 720px) {
    .version-check {
      grid-template-columns: 1fr;
    }

    .version-check-row {
      grid-column: auto;
    }
  }
</style>
