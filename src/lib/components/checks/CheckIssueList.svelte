<!--
  CheckIssueList — renders submission-lint issues and/or collisions as one
  compact list. Shared by the Files view (per-file lint, collisions panel) and
  the Parser's Checks tab so both read identically. Items are plain text (the
  engine's messages carry no HTML).
-->
<script lang="ts">
  import type { LintIssue, Collision } from '$lib/engine/audit';

  let {
    issues = [],
    collisions = [],
    showFiles = false,
    hideInfo = false,
  }: {
    issues?: LintIssue[];
    collisions?: Collision[];
    /** Show the files each collision involves (whole-folder view). */
    showFiles?: boolean;
    hideInfo?: boolean;
  } = $props();

  const shown = $derived(
    hideInfo ? issues.filter((i) => i.severity !== 'info') : issues,
  );
  const ICON = {
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info',
  } as const;
</script>

{#if shown.length || collisions.length}
  <ul class="checks">
    {#each collisions as c, i (`c${i}`)}
      <li class={c.severity}>
        <i
          class="fa-sharp-duotone fa-regular {ICON[c.severity]}"
          aria-hidden="true"
        ></i>
        <span class="msg">
          <span class="kind">{c.kind}</span>
          {c.message}
          {#if showFiles}
            <span class="files">{c.files.join(' · ')}</span>
          {/if}
        </span>
      </li>
    {/each}
    {#each shown as it, i (`l${i}`)}
      <li class={it.severity}>
        <i
          class="fa-sharp-duotone fa-regular {ICON[it.severity]}"
          aria-hidden="true"
        ></i>
        <span class="msg">
          <span class="kind">{it.rule}</span>
          {it.message}
          {#if it.ci}<span
              class="ci"
              title="The homebrew repo check that enforces this"
              >CI: {it.ci}</span
            >{/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    font-size: var(--text-xs);
  }
  li {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    color: var(--text-muted);
  }
  li.error i {
    color: var(--danger);
  }
  li.warning i {
    color: var(--warn);
  }
  li.info i {
    color: var(--text-faint);
  }
  .msg {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .kind {
    font-family: var(--font-mono);
    color: var(--text-faint);
    margin-inline-end: 0.375rem;
  }
  .ci,
  .files {
    display: block;
    color: var(--text-faint);
  }
</style>
