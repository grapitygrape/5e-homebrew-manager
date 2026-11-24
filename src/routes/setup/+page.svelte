<!--
  Setup — four-step first-run walkthrough (Repos, Folders, Download, Deployment).
  State and actions live in `state/setup-page.svelte.ts`. Nothing is saved until
  Finish; downloads in step 3 run as you go, and portable copies can import an
  existing installed setup via SetupImportBanner.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/ui/Button.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import View from '$lib/ui/View.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import {
    SETUP_CARD_TITLES,
    SETUP_STEPS,
    SetupPage,
  } from '$lib/state/setup-page.svelte.ts';
  import SetupImportBanner from './SetupImportBanner.svelte';
  import SetupReposStep from './SetupReposStep.svelte';
  import SetupFoldersStep from './SetupFoldersStep.svelte';
  import SetupDownloadStep from './SetupDownloadStep.svelte';
  import SetupDeployStep from './SetupDeployStep.svelte';

  const page = new SetupPage();

  onMount(() => page.mount());
</script>

<View class="setup">
  <ViewHeader>
    <h1>Set up Homebrew tools</h1>
    <p>Your repos, where they live, and where your homebrew goes.</p>
  </ViewHeader>

  {#if !page.desktop}
    <EmptyState>Setup runs in the desktop app.</EmptyState>
  {:else if page.loadError}
    <EmptyState variant="error"
      >Couldn't read the config: {page.loadError}</EmptyState
    >
  {:else if !page.draft}
    <EmptyState>Reading the current config…</EmptyState>
  {:else}
    <SetupImportBanner {page} />

    <ol class="setup-steps">
      {#each SETUP_STEPS as label, i (label)}
        <li
          class="setup-step"
          class:setup-step-current={i === page.step}
          class:setup-step-done={i < page.step}
          aria-current={i === page.step ? 'step' : undefined}
        >
          <span class="setup-step-number">{i + 1}</span>
          {label}
        </li>
      {/each}
    </ol>

    <Panel class="setup-panel">
      <div class="setup-card-head">
        <h2>{SETUP_CARD_TITLES[page.step]}</h2>
        <div class="setup-nav">
          <Button
            variant="text"
            disabled={page.step === 0 || page.syncing}
            onclick={() => page.step--}
          >
            Back
          </Button>
          {#if page.step < SETUP_STEPS.length - 1}
            <Button
              variant="primary"
              disabled={(page.step === 0 && !page.requiredUrlsSet) ||
                page.syncing}
              onclick={() => page.step++}
            >
              Next
            </Button>
          {:else}
            <Button
              variant="primary"
              disabled={page.finishing}
              onclick={page.finish}
            >
              {page.finishing ? 'Saving…' : 'Finish'}
            </Button>
          {/if}
        </div>
      </div>

      {#if page.step === 0}
        <SetupReposStep {page} draft={page.draft} />
      {:else if page.step === 1}
        <SetupFoldersStep {page} draft={page.draft} />
      {:else if page.step === 2}
        <SetupDownloadStep {page} draft={page.draft} />
      {:else}
        <SetupDeployStep {page} draft={page.draft} />
      {/if}
    </Panel>
  {/if}
</View>

<style>
  /* ── Setup - Step indicator ───────────────────────────────────────────── */
  .setup-steps {
    display: flex;
    gap: var(--space-4);
    margin-block: 0 var(--space-5);
    padding: 0;
    list-style: none;
    color: var(--text-faint);
    font-size: var(--text-sm);
  }

  .setup-step {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .setup-step-number {
    display: grid;
    place-items: center;
    inline-size: 1.5rem;
    block-size: 1.5rem;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    font-size: var(--text-xs);
  }

  .setup-step-done {
    color: var(--text-muted);

    & .setup-step-number {
      border-color: var(--ok);
      color: var(--ok);
    }
  }

  .setup-step-current {
    color: var(--text-main);

    & .setup-step-number {
      border-color: var(--gold);
      color: var(--gold-bright);
    }
  }

  /* ── Setup - Card header row ──────────────────────────────────────────── */
  .setup-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--hm-space-2-5);
    margin-block-end: var(--space-4);

    & h2 {
      margin: 0;
    }
  }

  .setup-nav {
    display: flex;
    gap: var(--space-2);
  }

  /* ── Setup - Shared across steps ──────────────────────────────────────── */
  :global(:where(.setup) .setup-intro) {
    margin-block: 0 var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  :global(:where(.setup) .setup-git-badge + .setup-intro) {
    margin-block: var(--space-1) 0;
  }

  :global(:where(.setup) .setup-field) {
    margin-block-end: var(--space-4);
  }

  :global(:where(.setup) .setup-field label) {
    display: block;
    margin-block-end: var(--space-1);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  :global(:where(.setup) .setup-field .text-input) {
    inline-size: 100%;
    font-family: var(--font-mono);
  }

  :global(.setup-note) {
    margin-block: var(--space-1) 0;
    font-size: var(--text-xs);
  }

  :global(:where(.setup) .setup-actions) {
    display: flex;
    gap: var(--hm-space-2-5);
  }
</style>
