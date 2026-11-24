<!--
  Customize Site - which of the modules bundled with the app (deploy-modules/)
  apply to the site, and their options.

  SHAPE
    A. One small card per module, or one card for modules that belong together
       (a manifest's `card` names it). Each has its switch, options and status.
    B. Navigation menus: one card per menu of the site, from the options'
       `group`. A ticked link stays in the menu; the saved option is `hide-*`,
       so the tick is the opposite of the value.

  SAVED AS YOU GO. Switches and options write to hbm-config.json as they change,
  so the next run from Deploy Site picks them up with no save step.

  TAURI ONLY. Everything here calls the Rust core, so a plain browser tab gets
  an empty state instead of a page full of failing switches.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import View from '$lib/ui/View.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import RowCard from '$lib/ui/RowCard.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import TextareaInput from '$lib/ui/TextareaInput.svelte';
  import { errorText } from '$lib/util';
  import {
    labelProblem,
    moduleCards,
    optionGroups,
  } from '$lib/services/customize-cards';
  import {
    isTauri,
    getCapabilities,
    checkDeployModules,
    listDeployModules,
    setDeployModule,
    type ModuleCheck,
    type DeployModule,
    type DeployModuleOption,
    type ModuleOptionValue,
  } from '$lib/tauri-bridge';

  let desktop = $state(false);
  let modules = $state<DeployModule[]>([]);
  let loadError = $state<string | null>(null);
  let banner = $state<string | null>(null);
  let checks = $state<Record<string, ModuleCheck>>({});
  let checkError = $state<string | null>(null);
  let checking = $state(false);

  const isMenus = (module: DeployModule) => module.options.some((o) => o.group);

  const cards = $derived(moduleCards(modules.filter((m) => !isMenus(m))));
  const menuModules = $derived(modules.filter(isMenus));

  async function loadModules() {
    loadError = null;
    try {
      modules = await listDeployModules();
    } catch (err) {
      loadError = errorText(err);
    }
  }

  async function loadChecks() {
    checking = true;
    checkError = null;
    try {
      const list = await checkDeployModules();
      checks = Object.fromEntries(list.map((c) => [c.id, c]));
    } catch (err) {
      checkError = errorText(err);
    } finally {
      checking = false;
    }
  }

  async function saveModule(
    module: DeployModule,
    enabled: boolean,
    options?: Record<string, ModuleOptionValue>,
  ) {
    banner = null;
    try {
      await setDeployModule({ moduleId: module.id, enabled, options });
      module.enabled = enabled;
      for (const [id, value] of Object.entries(options ?? {})) {
        const opt = module.options.find((o) => o.id === id);
        if (opt) opt.value = value;
      }
      await loadChecks();
    } catch (err) {
      banner = `Couldn't save ${module.title}: ${errorText(err)}`;
    }
  }

  const setOption = (
    module: DeployModule,
    opt: DeployModuleOption,
    value: ModuleOptionValue,
  ) => saveModule(module, module.enabled, { [opt.id]: value });

  function setLabel(
    module: DeployModule,
    opt: DeployModuleOption,
    input: HTMLInputElement,
  ) {
    const problem = labelProblem(input.value);
    if (problem) {
      banner = `${opt.label} wasn't saved. ${problem}`;
      input.value = typeof opt.value === 'string' ? opt.value : '';
      return;
    }
    setOption(module, opt, input.value.trim());
  }

  const listText = (value: ModuleOptionValue) =>
    Array.isArray(value) ? value.join('\n') : '';

  const listValue = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const checkVariant = (status: ModuleCheck['status']) =>
    status === 'ok' ? 'positive' : status === 'error' ? 'danger' : 'warning';

  const CHECK_LABELS: Record<ModuleCheck['status'], string> = {
    ok: 'Ready',
    skipped: 'Skipped',
    error: 'Error',
    off: 'Off',
  };

  onMount(() => {
    desktop = isTauri();
    if (desktop) {
      void loadModules();
      void loadChecks();
      return;
    }
    void getCapabilities()
      .then((caps) => {
        if (caps.pipeline) {
          desktop = true;
          void loadModules();
          void loadChecks();
        }
      })
      .catch(() => null);
  });
</script>

{#snippet moduleSwitch(module: DeployModule)}
  {@const check = checks[module.id]}
  <div class="module-head">
    {#if module.replacedBy}
      <!-- Its own switch would do nothing while the replacement is on. -->
      <span class="module-title">{module.title}</span>
      <Badge>Replaced by {module.replacedBy}</Badge>
    {:else}
      <label class="check-label module-title">
        <input
          type="checkbox"
          checked={module.enabled}
          onchange={(e) => saveModule(module, e.currentTarget.checked)}
        />
        {module.title}
      </label>
    {/if}
    {#if check && check.status !== 'off'}
      <Badge variant={checkVariant(check.status)}>
        {CHECK_LABELS[check.status]}
      </Badge>
    {/if}
  </div>
  <p class="module-description">{module.description}</p>
  {#if module.enabled && check?.details.length}
    <ul class="module-details">
      {#each check.details as detail, i (i)}
        <li>{detail}</li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet moduleOptions(module: DeployModule)}
  {@const toggles = module.options.filter((o) => o.kind === 'toggle')}
  {@const fields = module.options.filter((o) => o.kind !== 'toggle')}
  {#if toggles.length}
    <div class="module-toggles">
      {#each toggles as opt (opt.id)}
        <label class="check-label">
          <input
            type="checkbox"
            checked={opt.value === true}
            onchange={(e) => setOption(module, opt, e.currentTarget.checked)}
          />
          {opt.label}
        </label>
      {/each}
    </div>
  {/if}
  {#if fields.length}
    <div class="module-fields">
      {#each fields as opt (opt.id)}
        <div
          class={['module-field', opt.kind !== 'text' && 'module-field-wide']}
        >
          <label for="opt-{module.id}-{opt.id}">{opt.label}</label>
          {#if opt.kind === 'list'}
            <TextareaInput
              id="opt-{module.id}-{opt.id}"
              mono
              rows={Math.max(3, listText(opt.value).split('\n').length + 1)}
              value={listText(opt.value)}
              onchange={(e) =>
                setOption(module, opt, listValue(e.currentTarget.value))}
            />
          {:else if opt.kind === 'text'}
            <TextInput
              id="opt-{module.id}-{opt.id}"
              value={typeof opt.value === 'string' ? opt.value : ''}
              onchange={(e) => setLabel(module, opt, e.currentTarget)}
            />
          {:else}
            <TextInput
              id="opt-{module.id}-{opt.id}"
              value={typeof opt.value === 'string' ? opt.value : ''}
              onchange={(e) =>
                setOption(module, opt, e.currentTarget.value.trim())}
            />
            <span class="faint-note">
              A full path, or one starting with <code>{'{data}'}</code>
              for the app's data folder or <code>{'{manager}'}</code>
              for this app's repo folder.
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet moduleRow(module: DeployModule)}
  <div class="module-row">
    <div class="module-text">
      {@render moduleSwitch(module)}
      {#if module.enabled}
        {@render moduleOptions(module)}
      {/if}
    </div>
    {#if module.link}
      {@const link = module.link}
      <Button onclick={() => goto(link.href)}>{link.label}</Button>
    {/if}
  </div>
{/snippet}

<View width="wide">
  <ViewHeader>
    <h1>Customize Site</h1>
    <p>
      Changes save straight away and apply on the next full update or Apply
      customizations on <a href="/deploy">Deploy Site</a>.
    </p>
  </ViewHeader>

  {#if !desktop}
    <EmptyState>
      This view reads the customization modules through the desktop app. Open it
      with <code>npm run tauri:dev</code>.
    </EmptyState>
  {:else if loadError}
    <EmptyState variant="error">{loadError}</EmptyState>
  {:else if !modules.length}
    <EmptyState>Reading customizations…</EmptyState>
  {:else}
    {#if banner}
      <Banner tone="error" text={banner} ondismiss={() => (banner = null)} />
    {/if}

    <!-- A. Modules -->
    <section class="customize-section" aria-labelledby="customize-site-title">
      <div class="section-head">
        <h2 id="customize-site-title">Site</h2>
        <Button size="small" disabled={checking} onclick={loadChecks}>
          Recheck
        </Button>
      </div>
      <p class="section-lede">
        The status is a dry run of what the next apply would do.
      </p>
      {#if checkError}
        <p class="form-error">Couldn't check the modules: {checkError}</p>
      {/if}
      {#each cards as card, i (i)}
        <RowCard>
          <div class="module-card">
            {#if card.title}
              <h3>{card.title}</h3>
            {/if}
            {#each card.modules as module (module.id)}
              {@render moduleRow(module)}
            {/each}
          </div>
        </RowCard>
      {/each}
    </section>

    <!-- B. Navigation menus -->
    {#each menuModules as module (module.id)}
      <section class="customize-section" aria-label={module.title}>
        <RowCard>
          <div class="module-card">
            {@render moduleSwitch(module)}
          </div>
        </RowCard>
        {#if module.enabled}
          <div class="menu-cards">
            {#each optionGroups(module.options) as menu (menu.title)}
              <RowCard>
                <div class="module-card">
                  <h3>{menu.title}</h3>
                  <div class="menu-links">
                    {#each menu.options as opt (opt.id)}
                      <label class="check-label">
                        <input
                          type="checkbox"
                          checked={opt.value !== true}
                          onchange={(e) =>
                            setOption(module, opt, !e.currentTarget.checked)}
                        />
                        {opt.label}
                      </label>
                    {/each}
                  </div>
                </div>
              </RowCard>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  {/if}
</View>

<style>
  /* ── Shared - Text ──────────────────────────────────────────────────────── */
  .faint-note {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }

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

  /* ── Customize - Sections ───────────────────────────────────────────────── */
  .customize-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block-end: var(--space-6);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);

    h2 {
      margin: 0;
    }
  }

  .section-lede {
    margin-block: 0 var(--space-1);
    color: var(--text-muted);
  }

  /* ── Customize - Module Cards ───────────────────────────────────────────── */
  .module-card {
    display: grid;
    gap: var(--space-3);
    grid-column: 1 / -1;

    /* Menu cards stretch to the tallest in their row; keep content at the top. */
    align-self: start;
    min-inline-size: 0;

    h3 {
      margin: 0;
      font-size: var(--text-base);
    }
  }

  .module-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2) var(--space-5);
    align-items: center;
  }

  .module-text {
    min-inline-size: 0;
  }

  .module-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .module-title {
    color: var(--text-main);
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
  }

  .module-description {
    margin-block: var(--space-1) 0;
    padding-inline-start: var(--space-5);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .module-details {
    margin-block: var(--hm-space-1-5) 0;
    padding-inline-start: var(--space-6);
    color: var(--text-faint);
    font-size: var(--text-xs);
  }

  /* ── Customize - Module Options ─────────────────────────────────────────── */
  .module-toggles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: var(--hm-space-1-5) var(--space-3);
    margin-block-start: var(--space-3);
    padding-inline-start: var(--space-5);
  }

  .module-fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: var(--space-3);
    margin-block-start: var(--space-3);
    padding-inline-start: var(--space-5);
  }

  .module-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    > label {
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
  }

  .module-field-wide {
    grid-column: 1 / -1;
  }

  /* ── Customize - Menu Cards ─────────────────────────────────────────────── */
  .menu-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: var(--space-2);
  }

  .menu-links {
    display: grid;
    gap: var(--hm-space-1-5);
  }
</style>
