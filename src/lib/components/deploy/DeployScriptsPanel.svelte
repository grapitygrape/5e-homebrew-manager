<!--
  DeployScriptsPanel - "Other deployment options": a dry run, applying the
  customizations on their own, then the user's deploy scripts (run one by
  hand, edit, delete) and the form that adds or edits one. Scripts are the
  user's layer on top of the copy; they run after it, in order.
  Shared deploy styles (.deploy-options, .option-text, .action-row,
  .faint-note) come from routes/deploy/+page.svelte.
-->
<script lang="ts">
  import Panel from '$lib/ui/Panel.svelte';
  import PanelHead from '$lib/ui/PanelHead.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Button from '$lib/ui/Button.svelte';
  import RowCard from '$lib/ui/RowCard.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import TextareaInput from '$lib/ui/TextareaInput.svelte';
  import type { DeployScriptKind } from '$lib/tauri-bridge';
  import type { DeployPage } from '$lib/state/deploy-page.svelte';

  let { page }: { page: DeployPage } = $props();

  const SCRIPT_KINDS: { value: DeployScriptKind; label: string }[] = [
    { value: 'powershell', label: 'PowerShell (.ps1)' },
    { value: 'shell', label: 'Shell (.sh)' },
    { value: 'node', label: 'Node (.mjs)' },
  ];
</script>

<section class="deploy-options" aria-labelledby="deploy-options-title">
  <h2 id="deploy-options-title">Other deployment options</h2>

  <RowCard>
    <div class="option-text">
      <h3>Dry run</h3>
      <p>
        Walks through Prepare and Publish and logs what they would change.
        Nothing is pulled, written or published, and no script runs.
      </p>
    </div>
    <Button
      disabled={!!page.busy}
      onclick={() => page.run('full', 'Dry run', true)}
    >
      Dry run
    </Button>
  </RowCard>

  <RowCard>
    <div class="option-text">
      <h3>Apply customizations</h3>
      <p>
        Resets the files customizations change, so anything you switched off
        comes back, then applies what's switched on in
        <a href="/customize">Customize Site</a> and rebuilds the service worker. Doesn't
        pull or publish.
      </p>
    </div>
    <Button
      disabled={!!page.busy}
      onclick={() => page.run('local', 'Apply customizations')}
    >
      Apply
    </Button>
  </RowCard>

  {#each page.scripts as script (script.id)}
    <RowCard>
      <div class="option-text">
        <h3>
          {script.title}
          <Badge>Your script</Badge>
          {#if !script.enabled}<Badge variant="warning">Off</Badge>{/if}
        </h3>
        <p>
          {#if script.enabled}
            Runs after the copy on every publish. Run it on its own here.
          {:else}
            Switched off, so updates and publishes skip it. You can still run it
            here.
          {/if}
        </p>
      </div>
      <div class="action-row action-row-tight">
        <Button
          size="small"
          variant="text"
          disabled={!!page.busy}
          onclick={() => page.editScript(script)}
        >
          Edit
        </Button>
        <Button
          variant={page.armed === `script:${script.id}`
            ? 'primary'
            : 'outlined'}
          disabled={!!page.busy}
          onclick={() =>
            page.confirmed(`script:${script.id}`) &&
            page.run(`script:${script.id}`, script.title)}
        >
          {page.armed === `script:${script.id}` ? 'Click again to run' : 'Run'}
        </Button>
      </div>
    </RowCard>
  {/each}

  {#if page.draft}
    <Panel class="script-form">
      <PanelHead>
        <h3>
          {page.draft.id ? `Edit ${page.draft.title}` : 'Add a deploy script'}
        </h3>
      </PanelHead>
      <div class="script-fields">
        <div class="script-field">
          <label for="script-title">Title</label>
          <TextInput
            id="script-title"
            bind:value={page.draft.title}
            placeholder="Purge Cloudflare"
          />
        </div>
        <div class="script-field">
          <label for="script-kind">Kind</label>
          <SelectInput id="script-kind" bind:value={page.draft.kind}>
            {#each SCRIPT_KINDS as kind (kind.value)}
              <option value={kind.value}>{kind.label}</option>
            {/each}
          </SelectInput>
        </div>
      </div>
      <div class="script-field">
        <label for="script-content">Script</label>
        <TextareaInput
          id="script-content"
          mono
          rows={14}
          bind:value={page.draft.content}
        />
      </div>
      <p class="faint-note script-help">
        It runs in the 5e checkout after the site is copied, with
        <code>HBM_SITE_DIR</code>, <code>HBM_DEPLOY_FOLDERS</code> and
        <code>HBM_CHANGED_FILES</code> (the site paths a cache purge should
        cover, one per line). Keep tokens out of the script: set them as
        environment variables or in a <code>.env</code> beside hbm-config.json, and
        the script gets them.
      </p>
      <label class="check-label script-toggle">
        <input type="checkbox" bind:checked={page.draft.enabled} />
        Run after the copy on every publish
      </label>
      {#if page.draftError}
        <p class="form-error">{page.draftError}</p>
      {/if}
      <div class="action-row">
        <Button variant="primary" onclick={page.saveDraft}>Save script</Button>
        <Button variant="text" onclick={() => (page.draft = null)}
          >Cancel</Button
        >
        {#if page.draft.id}
          {@const saved = page.scripts.find((s) => s.id === page.draft?.id)}
          {#if saved}
            <Button
              variant={page.armed === `delete:${saved.id}` ? 'primary' : 'text'}
              onclick={() => page.removeScript(saved)}
            >
              {page.armed === `delete:${saved.id}`
                ? 'Click again to delete'
                : 'Delete script'}
            </Button>
          {/if}
        {/if}
      </div>
    </Panel>
  {:else}
    <div>
      <Button
        variant="outlined"
        class="add-script"
        disabled={!!page.busy}
        onclick={() => page.editScript(null)}
      >
        <span class="add-script-icon" aria-hidden="true">+</span>
        Add a deploy script
      </Button>
    </div>
  {/if}
</section>

<style>
  .form-error {
    margin-block: 0 var(--space-2);
    color: var(--danger);
    font-size: var(--text-sm);
  }

  .check-label {
    display: flex;
    align-items: center;
    gap: var(--hm-space-1-5);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* ── Deploy - Script Form ───────────────────────────────────────────────── */
  .deploy-options :global(.script-form) {
    margin-block-end: 0;
  }

  .script-fields {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: var(--space-3);
  }

  .script-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-block-end: var(--space-3);

    > label {
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
  }

  .add-script-icon {
    font-size: var(--text-base);
    line-height: 1;
  }

  .script-help {
    margin-block: 0 var(--space-3);
    line-height: var(--line-height-normal);
  }

  .script-toggle {
    margin-block-end: var(--space-3);
  }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 720px) {
    .script-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
