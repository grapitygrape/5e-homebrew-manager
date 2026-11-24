<!--
  Settings — edit, validate, and persist the data-source configuration. Each
  source takes a local path OR an https:// URL; saving hot-swaps the running
  DataSource. In the desktop app each path field gets a native folder picker;
  in a plain browser tab paths are typed/pasted.

  The repos and deploy lists match setup's steps, so anything chosen there can
  be changed here. Changing a repo folder moves the sources it feeds.

  With the Foundry Data folder saved, a save also deploys the bridge module
  bundled with the app when it's missing or stale; the Deploy bridge button
  redeploys on demand.
-->
<script lang="ts">
  import type { PageProps } from './$types';
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { forget } from '$lib/state/page-cache.svelte.ts';
  import { resetSourceDisplay } from '$lib/state/source-display.svelte.ts';
  import Badge from '$lib/ui/Badge.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import View from '$lib/ui/View.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import FolderList from '$lib/components/FolderList.svelte';
  import { SOURCE_REPOS, derivedSources } from '$lib/data';
  import type { SourceRepoId } from '$lib/data';
  import {
    isTauri,
    pickFolderDialog,
    openExternalTarget,
  } from '$lib/tauri-bridge';
  import {
    deployBridgeModule,
    getBridgeDeployStatus,
    getCapabilities,
    saveSettings,
    syncBridgeModule,
    type BridgeDeployStatus,
  } from '$lib/api';

  let { data }: PageProps = $props();

  const SOURCES = [
    {
      key: 'data',
      label: 'Source data',
      hint: 'items.json, spells/, class/, races.json…',
    },
    { key: 'schema', label: 'Brew schema', hint: 'schema/brew folder' },
    { key: 'guides', label: 'Conversion guides', hint: 'folder of .md guides' },
    {
      key: 'homebrew',
      label: 'Your homebrew files',
      hint: 'folder of homebrew .json',
    },
    {
      key: 'partnered',
      label: 'Partnered brew repo',
      hint: 'optional: a TheGiddyLimit/homebrew checkout — adds its partnered sources to the blocklist index',
    },
  ] as const;

  // `partnered` is optional, so this may be handed nothing at all.
  const refValue = (r?: { path?: string; url?: string }) =>
    r?.url ?? r?.path ?? '';
  const status = $derived(data.status);
  let saving = $state(false);
  let result = $state<{ saved: true } | { error: string } | null>(null);
  let desktop = $state(false);
  let canRunSetup = $state(false);
  let copiedKey = $state<string | null>(null);
  let bridgeManifestUrl = $state('/api/bridge/module.json');

  function copyPath(key: string, text: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      copiedKey = key;
      setTimeout(() => {
        if (copiedKey === key) copiedKey = null;
      }, 2000);
    });
  }

  // Path fields are state so the folder picker can fill them in. A one-time
  // snapshot on purpose: the form holds unsaved edits until Save.
  const initialPaths = () => ({
    data: refValue(data.config.data),
    schema: refValue(data.config.schema),
    guides: refValue(data.config.guides),
    homebrew: refValue(data.config.homebrew),
    partnered: refValue(data.config.partnered),
    foundryDataPath: data.app.foundryDataPath,
  });
  let paths = $state(initialPaths());
  type PathKey = keyof typeof paths;
  // Snapshots, like the paths above.
  const initialRepos = () => structuredClone(data.repos);
  const initialSite = () => [...data.app.siteDeployFolders];
  const initialHomebrew = () => [...data.app.homebrewDeployFolders];
  let repos = $state(initialRepos());
  let siteFolders = $state(initialSite());
  let homebrewFolders = $state(initialHomebrew());

  const LIST_FIELDS = ['siteDeployFolders', 'homebrewDeployFolders'];

  /** A repo folder moved: point the sources it feeds into the new one. */
  function repoMoved(id: SourceRepoId) {
    const derived = derivedSources({ [id]: repos[id] });
    for (const [key, ref] of Object.entries(derived))
      paths[key as PathKey] = ref.path ?? '';
  }

  async function browseRepo(id: SourceRepoId) {
    const picked = await pickFolderDialog(repos[id].path || undefined);
    if (picked) {
      repos[id].path = picked;
      repoMoved(id);
    }
  }

  let bridgeDeploy = $state<BridgeDeployStatus | null>(null);
  let bridgeBusy = $state(false);
  let bridgeNote = $state<{ ok: boolean; text: string } | null>(null);

  // Deploy reads the saved path, so an unsaved edit would be ignored.
  const bridgeDirty = $derived(
    paths.foundryDataPath.trim() !== data.app.foundryDataPath.trim(),
  );

  async function loadBridgeDeploy() {
    try {
      bridgeDeploy = await getBridgeDeployStatus();
    } catch (e) {
      bridgeNote = { ok: false, text: (e as Error).message };
    }
  }

  async function deployBridge() {
    bridgeBusy = true;
    bridgeNote = null;
    try {
      const r = await deployBridgeModule();
      bridgeNote = {
        ok: true,
        text: `Deployed ${r.copied} files to ${r.target}. Reload the Foundry world to pick it up.`,
      };
    } catch (e) {
      bridgeNote = { ok: false, text: (e as Error).message };
    } finally {
      bridgeBusy = false;
      await loadBridgeDeploy();
    }
  }

  const BRIDGE_BADGE: Record<
    BridgeDeployStatus['state'],
    { variant: 'default' | 'positive' | 'danger' | 'warning'; text: string }
  > = {
    unset: { variant: 'default', text: 'not set' },
    'no-source': { variant: 'danger', text: 'module not found' },
    'no-foundry': { variant: 'danger', text: 'no modules folder' },
    missing: { variant: 'warning', text: 'not installed' },
    outdated: { variant: 'warning', text: 'out of date' },
    current: { variant: 'positive', text: 'up to date' },
    linked: { variant: 'positive', text: 'linked' },
  };

  onMount(() => {
    desktop = isTauri();
    canRunSetup = desktop;
    if (typeof window !== 'undefined' && window.location?.origin) {
      bridgeManifestUrl = `${window.location.origin}/api/bridge/module.json`;
    }
    if (!desktop) {
      void getCapabilities()
        .then((caps) => {
          if (caps.repos) canRunSetup = true;
        })
        .catch(() => null);
    }
    void loadBridgeDeploy();
  });

  async function browse(key: PathKey) {
    const current = paths[key].trim();
    // A URL isn't a folder to start from.
    const startDir = current && !/^https?:\/\//i.test(current) ? current : '';
    const picked = await pickFolderDialog(startDir || undefined);
    if (picked) paths[key] = picked;
  }

  async function save(ev: SubmitEvent & { currentTarget: HTMLFormElement }) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    const fields: Record<string, string | string[]> = {};
    for (const [name, value] of form) fields[name] = String(value);
    for (const name of LIST_FIELDS)
      fields[name] = form.getAll(name).map(String);
    saving = true;
    result = null;
    try {
      await saveSettings(fields);
      // New paths make every remembered view wrong, not just stale.
      forget();
      resetSourceDisplay();
      // Re-read the view so the statuses and stored values show what was saved.
      await invalidateAll();
      result = { saved: true };
      // Both bridge paths set: install or refresh the module. A failure here
      // doesn't undo the save, so it's reported beside the bridge row instead.
      bridgeNote = null;
      try {
        const deployed = await syncBridgeModule();
        if (deployed)
          bridgeNote = {
            ok: true,
            text: `Deployed the bridge module (${deployed.copied} files) to ${deployed.target}. Reload the Foundry world to pick it up.`,
          };
      } catch (e) {
        bridgeNote = { ok: false, text: (e as Error).message };
      }
      await loadBridgeDeploy();
    } catch (e) {
      result = { error: (e as Error).message };
    } finally {
      saving = false;
    }
  }

  function statusBadge(s: { kind: string; exists: boolean | null }) {
    if (s.kind === 'url') return { variant: 'default' as const, text: 'URL' };
    if (s.kind === 'unset')
      return { variant: 'default' as const, text: 'not set' };
    return s.exists
      ? { variant: 'positive' as const, text: 'folder found' }
      : { variant: 'danger' as const, text: 'not found' };
  }
</script>

{#snippet browseButton(key: PathKey)}
  {#if desktop}
    <Button size="small" onclick={() => browse(key)}>Browse…</Button>
  {/if}
{/snippet}

<View>
  <div class="settings-header">
    <ViewHeader>
      <h1>Settings</h1>
      <p>
        Where this install reads its source data. Bring your own data — nothing
        is bundled.
      </p>
    </ViewHeader>
    <div class="settings-actions">
      {#if result && 'saved' in result}<StatusText variant="ok"
          >Saved – sources updated.</StatusText
        >{/if}
      {#if result && 'error' in result}<StatusText variant="error"
          >{result.error}</StatusText
        >{/if}
      {#if canRunSetup}
        <Button variant="secondary" onclick={() => goto('/setup')}
          >Run setup again</Button
        >
      {/if}
      <Button
        variant="primary"
        type="submit"
        form="settings-form"
        disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button
      >
    </div>
  </div>

  <form id="settings-form" method="POST" onsubmit={save}>
    <Panel>
      <div class="settings-card-head"><h2>Links</h2></div>

      <div class="src-row">
        <label for="toolsUrl">Tools URL</label>
        <div class="field">
          <TextInput
            id="toolsUrl"
            name="toolsUrl"
            value={data.app.toolsUrl}
            placeholder="https://your-tools-site.example"
            spellcheck="false"
            autocomplete="off"
          />
        </div>
        <p class="hint">
          Where content links resolve — shop items link to <code
            >&lt;url&gt;/items.html#…</code
          >.
        </p>
      </div>

      <div class="src-row">
        <label for="foundryUrls">Foundry URL</label>
        <div class="field">
          <TextInput
            id="foundryUrls"
            name="foundryUrls"
            value={data.app.foundryUrls.join(', ')}
            placeholder="http://localhost:30000, http://foundry.local:30001"
            spellcheck="false"
            autocomplete="off"
          />
        </div>
        <p class="hint">
          Local Foundry VTT instance(s), comma-separated. Linked from the
          Dashboard — and this is also the <b
            >allowlist for the Foundry bridge</b
          >: only these origins may connect to
          <code>/api/foundry/*</code>. A world whose URL isn't listed here is
          refused, and the Files view offers an Allow button for it. The module
          connects to both the desktop app (<code>http://localhost:5051</code>,
          <code>app.bridgePort</code> in hbm-config.json) and the dev server (<code
            >http://localhost:5173</code
          >) by default.
        </p>
      </div>
    </Panel>

    <Panel>
      <div class="settings-card-head"><h2>Repos</h2></div>
      {#each SOURCE_REPOS as r (r.id)}
        <div class="src-row">
          <label for="repo-{r.id}-url">
            {r.label}{#if !r.required}<span class="optional">
                (optional)</span
              >{/if}
          </label>
          <div class="field">
            <TextInput
              id="repo-{r.id}-url"
              name="repo.{r.id}.url"
              bind:value={repos[r.id].url}
              placeholder={r.hint}
              spellcheck="false"
              autocomplete="off"
            />
          </div>
          <div class="field field-second">
            <TextInput
              name="repo.{r.id}.path"
              aria-label="{r.label} folder"
              bind:value={repos[r.id].path}
              placeholder="folder"
              spellcheck="false"
              autocomplete="off"
              onchange={() => repoMoved(r.id)}
            />
            {#if desktop}
              <Button size="small" onclick={() => browseRepo(r.id)}
                >Browse…</Button
              >
            {/if}
          </div>
        </div>
      {/each}
    </Panel>

    <Panel>
      <div class="settings-card-head"><h2>Sources</h2></div>
      {#each SOURCES as s (s.key)}
        {@const b = statusBadge(status[s.key])}
        <div class="src-row">
          <label for={s.key}>{s.label}</label>
          <div class="field">
            <TextInput
              id={s.key}
              name={s.key}
              bind:value={paths[s.key]}
              placeholder="local path  or  https://… URL"
              spellcheck="false"
              autocomplete="off"
            />
            {@render browseButton(s.key)}
            <Badge variant={b.variant}>{b.text}</Badge>
          </div>
          <p class="hint">
            {s.hint}
            {#if status[s.key].resolved}· <code>{status[s.key].resolved}</code
              >{/if}
          </p>
        </div>
      {/each}
    </Panel>

    <Panel>
      <div class="settings-card-head"><h2>Deployment</h2></div>
      <p class="hint section-hint">
        This app serves a copy of the site for local testing. Site folders get
        the whole site on deploy; homebrew folders (a Foundry homebrew folder, a
        live site's <code>homebrew/</code>) get each brew the Files page
        deploys.
      </p>

      <div class="src-row">
        <h3 class="list-head">Deploy site to</h3>
        <FolderList
          bind:values={siteFolders}
          name="siteDeployFolders"
          label="Site deploy folder"
          {desktop}
        />
      </div>

      <div class="src-row">
        <h3 class="list-head">Deploy homebrew files to</h3>
        <FolderList
          bind:values={homebrewFolders}
          name="homebrewDeployFolders"
          label="Homebrew deploy folder"
          {desktop}
        />
      </div>

      <div class="src-row">
        <h3 class="list-head">Data folder</h3>
        <div class="field">
          <code>{data.dataFolder}</code>
          {#if desktop}
            <Button
              size="small"
              onclick={() => openExternalTarget(data.dataFolder)}
              >Open folder</Button
            >
          {:else}
            <Button
              size="small"
              onclick={() => copyPath('dataFolder', data.dataFolder)}
              >{copiedKey === 'dataFolder' ? 'Copied' : 'Copy path'}</Button
            >
          {/if}
        </div>
        <p class="hint">
          Beside these settings: <code>fonts/</code> for the site theme,
          <code>scripts/</code> for deploy scripts, <code>content/</code> for
          your home page and Replace Content's list, and a <code>.env</code>
          with deploy-script tokens. Each folder has a README saying what goes
          in it.
        </p>
      </div>

      <div class="src-row">
        <label for="foundryDataPath">Foundry Data folder</label>
        <div class="field">
          <TextInput
            id="foundryDataPath"
            name="foundryDataPath"
            bind:value={paths.foundryDataPath}
            placeholder="Foundry user data folder, or its Data folder"
            spellcheck="false"
            autocomplete="off"
          />
          {@render browseButton('foundryDataPath')}
        </div>
        <p class="hint">
          Saving installs the bundled <code>foundry-homebrew-bridge</code> module
          into <code>Data/modules</code>, and updates it whenever the bundled
          copy changes. Or install remotely in Foundry via Manifest URL:
          <code>{bridgeManifestUrl}</code>
          <Button
            size="small"
            onclick={() => copyPath('bridgeManifest', bridgeManifestUrl)}
            >{copiedKey === 'bridgeManifest'
              ? 'Copied'
              : 'Copy manifest URL'}</Button
          >
        </p>
        <div class="bridge-deploy">
          {#if bridgeDeploy}
            {@const b = BRIDGE_BADGE[bridgeDeploy.state]}
            <Badge variant={b.variant}>Bridge module: {b.text}</Badge>
            {#if bridgeDeploy.installedVersion || bridgeDeploy.sourceVersion}
              <span class="bridge-versions">
                {#if bridgeDeploy.installedVersion}installed v{bridgeDeploy.installedVersion}{/if}
                {#if bridgeDeploy.installedVersion && bridgeDeploy.sourceVersion}
                  ·
                {/if}
                {#if bridgeDeploy.sourceVersion}repo v{bridgeDeploy.sourceVersion}{/if}
              </span>
            {/if}
          {/if}
          <Button
            size="small"
            onclick={deployBridge}
            disabled={bridgeBusy ||
              bridgeDirty ||
              !bridgeDeploy?.sourceDir ||
              !bridgeDeploy?.target ||
              bridgeDeploy.state === 'linked'}
            >{bridgeBusy ? 'Deploying…' : 'Deploy bridge'}</Button
          >
        </div>
        {#if bridgeDirty}
          <p class="hint">Save to use the new path.</p>
        {:else if bridgeNote}
          <StatusText as="p" variant={bridgeNote.ok ? 'ok' : 'error'}
            >{bridgeNote.text}</StatusText
          >
        {:else if bridgeDeploy?.message}
          <p class="hint">{bridgeDeploy.message}</p>
        {/if}
      </div>
    </Panel>
  </form>

  <p class="store">
    Saved to <code>{data.storePath}</code> (git-ignored; overrides env +
    defaults).
    {#if desktop}
      <Button size="small" onclick={() => openExternalTarget(data.storePath)}
        >Open in editor</Button
      >
    {:else}
      <Button
        size="small"
        onclick={() => copyPath('storePath', data.storePath)}
        >{copiedKey === 'storePath' ? 'Copied' : 'Copy path'}</Button
      >
    {/if}
  </p>
</View>

<style>
  form {
    max-width: 720px;
  }
  /* ── Settings - Header ────────────────────────────────────────────────── */
  .settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .settings-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--hm-space-2-5);
  }

  /* ── Settings - Cards ─────────────────────────────────────────────────── */
  .settings-card-head {
    margin-block-end: var(--space-4);

    & h2 {
      margin: 0;
    }
  }

  /* The last row's gap would double up with the card padding. */
  .src-row:last-child {
    margin-block-end: 0;
  }

  .section-hint {
    margin-block: calc(-1 * var(--space-2)) var(--hm-space-3-5);
  }

  /* ── Settings - Fields ────────────────────────────────────────────────── */
  .list-head {
    margin-block: 0 0.25rem;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-normal);
    color: var(--text-muted);
  }
  .optional {
    color: var(--text-faint);
  }
  .field-second {
    margin-block-start: var(--hm-space-1-5);
  }
  .src-row {
    margin-bottom: 1.125rem;
  }
  label {
    display: block;
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .field :global(.text-input) {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
  }
  .hint {
    margin: 0.25rem 0 0;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .hint code {
    font-size: var(--hm-text-2xs);
  }
  .bridge-deploy {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-block-start: var(--hm-space-1-5);
  }
  .bridge-versions {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .store {
    margin: 1.25rem 0 0;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .store :global(.button) {
    margin-inline-start: var(--space-1);
  }
</style>
