<!--
  SetupReposStep — Step 1: GitHub URLs for the source repositories.
-->
<script lang="ts">
  import TextInput from '$lib/ui/TextInput.svelte';
  import { SOURCE_REPOS } from '$lib/data';
  import type { SetupDraft } from '$lib/api';
  import type { SetupPage } from '$lib/state/setup-page.svelte.ts';

  interface Props {
    page: SetupPage;
    draft: SetupDraft;
  }

  let { page, draft }: Props = $props();
</script>

<p class="setup-intro">The GitHub repos to download.</p>
{#each SOURCE_REPOS as r (r.id)}
  <div class="setup-field">
    <label for="url-{r.id}">
      {r.label}{#if !r.required}<span class="setup-optional"> (optional)</span
        >{/if}
    </label>
    <TextInput
      id="url-{r.id}"
      bind:value={draft.repos[r.id].url}
      placeholder={r.hint}
      spellcheck="false"
      autocomplete="off"
      onchange={() => page.inspect(r.id)}
    />
  </div>
{/each}

<style>
  .setup-optional {
    margin-left: var(--space-1);
    color: var(--text-faint);
  }
</style>
