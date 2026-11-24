<!--
  IssueItem — one clickable error or warning in the Parser's outline (the
  Errors tab, and the issues expanded under an outline row). `html` is the
  engine's message markup; `link` marks a content-link issue with an icon.
  `inset` is for issues inside an expanded row, which supplies its own indent.
-->
<script lang="ts">
  let {
    severity,
    html,
    link = false,
    inset = false,
    title,
    onactivate,
  }: {
    severity: 'err' | 'warn';
    html: string;
    link?: boolean;
    inset?: boolean;
    title?: string;
    onactivate: () => void;
  } = $props();
</script>

<div
  class="issue {severity}"
  class:link
  class:inset
  {title}
  role="button"
  tabindex="0"
  onclick={onactivate}
  onkeydown={(e) => e.key === 'Enter' && onactivate()}
>
  {#if link}<i class="fa-sharp-duotone fa-regular fa-link" aria-hidden="true"
    ></i>{/if}
  {@html html}
</div>

<style>
  .issue {
    font-size: var(--text-xs);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    background: var(--bg-sidebar);
    cursor: pointer;
    margin: 0 0.75rem 0.125rem 1.625rem;
  }
  .issue.inset {
    margin: 0;
  }
  .issue.err {
    color: var(--danger);
  }
  .issue.warn {
    color: var(--warn);
  }
  .issue.link {
    opacity: 0.95;
  }
</style>
