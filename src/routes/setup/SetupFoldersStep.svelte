<!--
  SetupFoldersStep — Step 2: parent folder shortcut and per-repo checkout paths.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import { SOURCE_REPOS } from '$lib/data';
  import type { SetupDraft } from '$lib/api';
  import { folderNote, type SetupPage } from '$lib/state/setup-page.svelte.ts';

  interface Props {
    page: SetupPage;
    draft: SetupDraft;
  }

  let { page, draft }: Props = $props();
</script>

<div class="setup-field">
  <label for="parent">Save all repos under</label>
  <div class="setup-path">
    <TextInput
      id="parent"
      value={draft.parent}
      placeholder="A folder for all the repos"
      spellcheck="false"
      autocomplete="off"
      onchange={(e) => page.setParent(e.currentTarget.value)}
    />
    {#if page.nativeDialogs}
      <Button size="small" onclick={page.browseParent}>Browse…</Button>
    {/if}
  </div>
</div>

{#each SOURCE_REPOS as r (r.id)}
  {@const note = folderNote(page.checks[r.id])}
  <div class="setup-field">
    <label for="path-{r.id}">{r.label}</label>
    <div class="setup-path">
      <TextInput
        id="path-{r.id}"
        bind:value={draft.repos[r.id].path}
        spellcheck="false"
        autocomplete="off"
        onchange={() => page.inspect(r.id)}
      />
      {#if page.nativeDialogs}
        <Button size="small" onclick={() => page.browseRepo(r.id)}
          >Browse…</Button
        >
      {/if}
    </div>
    {#if note.text}
      <StatusText
        as="p"
        class="setup-note"
        variant={note.variant === 'warning'
          ? 'warning'
          : note.variant === 'positive'
            ? 'ok'
            : 'default'}
      >
        {note.text}
      </StatusText>
    {/if}
    {#if r.description && ['missing', 'empty'].includes(page.checks[r.id]?.state ?? '')}
      <p class="setup-note setup-description">{r.description}</p>
    {/if}
  </div>
{/each}

<style>
  .setup-path {
    display: flex;
    align-items: center;
    gap: var(--hm-space-2-5);

    & :global(.text-input) {
      flex: 1;
      min-inline-size: 0;
    }
  }

  .setup-description {
    color: var(--text-faint);
  }
</style>
