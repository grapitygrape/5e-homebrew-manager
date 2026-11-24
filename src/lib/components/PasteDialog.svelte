<!--
  PasteDialog — a modal with one large textarea and one action, for flows that
  start from pasted text (the Parser's Add content and Merge reply).

  `onsubmit` does the work. It resolves to close the dialog, or throws a
  message to show here, leaving the text in place to fix and retry. The text is
  bindable so the caller can keep it between openings.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import TextareaInput from '$lib/ui/TextareaInput.svelte';

  interface Props {
    title: string;
    intro: string;
    placeholder?: string;
    action: string;
    busyAction: string;
    value?: string;
    onsubmit: (text: string) => Promise<void>;
    onclose: () => void;
  }

  let {
    title,
    intro,
    placeholder,
    action,
    busyAction,
    value = $bindable(''),
    onsubmit,
    onclose,
  }: Props = $props();

  let busy = $state(false);
  let error = $state('');

  async function submit() {
    busy = true;
    error = '';
    try {
      await onsubmit(value);
      onclose();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && value.trim())
      void submit();
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}></div>

<div class="modal" role="dialog" aria-modal="true" aria-label={title}>
  <header>
    <h2>{title}</h2>
    <button class="icon" onclick={onclose} aria-label="Close"
      ><i class="fa-sharp-duotone fa-regular fa-xmark" aria-hidden="true"
      ></i></button
    >
  </header>
  <div class="body">
    <p class="hint">{intro}</p>
    <!-- svelte-ignore a11y_autofocus -->
    <TextareaInput
      class="paste"
      mono
      autofocus
      {placeholder}
      aria-label={title}
      bind:value
    />
    {#if error}<p class="bad" role="alert">{error}</p>{/if}
  </div>
  <footer>
    <Button variant="text" onclick={onclose}>Cancel</Button>
    <Button
      variant="primary"
      onclick={submit}
      disabled={busy || !value.trim()}
      title="Ctrl+Enter">{busy ? busyAction : action}</Button
    >
  </footer>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: hsl(0 0% 0% / 0.6);
    z-index: 40;
  }
  .modal {
    position: fixed;
    inset: 8vh 10vw;
    z-index: 41;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: 0 18px 60px hsl(0 0% 0% / 0.55);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  header h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: var(--tracking-tight);
  }
  .icon {
    margin-inline-start: auto;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: var(--text-lg);
    cursor: pointer;
  }
  .icon:hover {
    color: var(--text-main);
  }
  .body {
    flex: 1;
    min-height: 0;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .body :global(.paste) {
    flex: 1;
    resize: none;
  }
  .hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  .bad {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--danger);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
  }
</style>
