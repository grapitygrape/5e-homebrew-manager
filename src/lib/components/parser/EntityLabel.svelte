<!--
  EntityLabel — an object's type and name, as the Parser's outline rows, issue
  headings and Resolved heading show them. Renders two spans with no wrapper,
  so they sit directly in the parent's flex row (the name takes the slack).
-->
<script lang="ts">
  let { type, name }: { type: string; name: string } = $props();
</script>

<span class="r-type">{type}</span>
<span class="r-name">{name}</span>

<style>
  .r-type {
    font-size: var(--hm-text-2xs);
    text-transform: uppercase;
    color: var(--text-faint);
    flex-shrink: 0;
  }
  .r-name {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
