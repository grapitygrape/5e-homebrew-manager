<!--
  FolderList - a growing list of folder paths. There is always one empty row
  at the bottom; typing in it (or picking a folder) adds a row, and each filled
  row has a remove button. Inputs carry `name`, so a form's FormData.getAll()
  reads the list. Blank rows are dropped when the list is saved.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import { pickFolderDialog } from '$lib/tauri-bridge';

  let {
    values = $bindable([]),
    name,
    label,
    desktop = false,
    placeholder = 'Add a folder',
    locked = [],
    lockedTitle = 'Set automatically',
  }: {
    values: string[];
    name: string;
    /** For screen readers: what the folders are for. */
    label: string;
    desktop?: boolean;
    placeholder?: string;
    /** Folders worked out elsewhere: shown first, read-only, not in `values`. */
    locked?: string[];
    lockedTitle?: string;
  } = $props();

  const rows = $derived([...values, '']);

  function set(index: number, value: string) {
    if (index === values.length) values = [...values, value];
    else values = values.map((v, i) => (i === index ? value : v));
  }

  async function browse(index: number) {
    const picked = await pickFolderDialog(rows[index] || undefined);
    if (picked) set(index, picked);
  }

  function remove(index: number) {
    values = values.filter((_, i) => i !== index);
  }
</script>

<div class="folder-list">
  {#each locked as value (value)}
    <div class="folder-list-row">
      <div class="folder-list-lock-field" title={lockedTitle}>
        <i
          class="folder-list-lock fa-sharp-duotone fa-regular fa-lock"
          aria-hidden="true"
        ></i>
        <TextInput
          {value}
          aria-label="{label} (set automatically)"
          disabled
          spellcheck="false"
          autocomplete="off"
        />
      </div>
    </div>
  {/each}
  {#each rows as value, i (i)}
    <div class="folder-list-row">
      <TextInput
        {name}
        {value}
        aria-label="{label} {i + 1}"
        placeholder={i === values.length ? placeholder : undefined}
        spellcheck="false"
        autocomplete="off"
        oninput={(e) => set(i, e.currentTarget.value)}
      />
      {#if desktop}
        <Button size="small" onclick={() => browse(i)}>Browse…</Button>
      {/if}
      {#if i < values.length}
        <Button
          size="small"
          variant="text"
          aria-label="Remove {value || 'folder'}"
          title="Remove"
          onclick={() => remove(i)}
        >
          <i class="fa-sharp-duotone fa-regular fa-trash-can" aria-hidden="true"
          ></i>
        </Button>
      {:else}
        <span class="folder-list-spacer" aria-hidden="true"></span>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* ── Folder list - Layout ─────────────────────────────────────────────── */
  .folder-list {
    display: grid;
    gap: var(--space-2);
  }

  .folder-list-row {
    display: flex;
    align-items: center;
    gap: var(--hm-space-2-5);

    & :global(.text-input) {
      flex: 1;
      min-inline-size: 0;
      font-family: var(--font-mono);
    }
  }

  /* ── Folder list - Locked rows ────────────────────────────────────────── */
  .folder-list-lock-field {
    position: relative;
    flex: 1;
    min-inline-size: 0;

    & :global(.text-input) {
      /* Room for the lock plus a gap before the text. */
      padding-inline-start: 2.5rem;
      color: var(--text-muted);
      opacity: 1;
    }
  }

  .folder-list-lock {
    position: absolute;
    inset-inline-start: var(--space-3);
    inset-block-start: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }

  /* Keeps the empty row's input as wide as the filled ones. */
  .folder-list-spacer {
    inline-size: 2rem;
  }
</style>
