<!--
  FoundryScanModal - "Scan Foundry" on Replace Content.

  Two stages in one dialog: confirm what to search (characters, NPCs, world
  items), then the hits as a table. The rules come from the page's staged
  mappings, so an unsaved mapping scans too. The module does the matching; this
  only asks and lays out the answer.

  Each row's second line says where it was found. Replace swaps an actor's item
  in Foundry (see foundry-homebrew-bridge/scripts/replace.js). A world item has
  nothing to replace, so its button is absent. Stand-ins already swapped in
  aren't listed, only counted.

  The connection is checked live, not read from the status list: every listed
  world is pinged while the dialog is open, and only those that answer are
  offered. Right after the manager starts, the module may still be waiting out
  its retry delay, so the list fills in on its own.

  Below the scope it shows what the world reports it enforces on import. The
  switches are module settings in Foundry, and the saved mappings reach the
  world on their own (state/foundry.svelte.ts), so there is nothing to send.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import {
    openInFoundry,
    pingFoundry,
    replaceInFoundry,
    scanFoundry,
  } from '$lib/api';
  import {
    foundry,
    refreshFoundryStatus,
  } from '$lib/state/foundry.svelte.ts';
  import {
    BRIDGE_FEATURES,
    type BridgeClientInfo,
    type ScanRule,
    type ScanScope,
  } from '$lib/engine/foundry/types.ts';
  import {
    buildScanRows,
    enforcementStatus,
    type ScanRow,
  } from '$lib/engine/foundry/replacements.ts';
  import { formatNumber, plural } from '$lib/util';

  interface Props {
    rules: ScanRule[];
    onclose: () => void;
  }

  let { rules, onclose }: Props = $props();

  /** Listed worlds that answered a ping. The rest of the list may be stale. */
  let live = $state<BridgeClientInfo[]>([]);
  /** True until the first poll's pings have all come back. */
  let checking = $state(true);
  let clientId = $state('');
  let scope = $state<ScanScope>({ characters: true, npcs: true, items: true });
  let scanning = $state(false);
  let error = $state('');
  let rows = $state<ScanRow[] | null>(null);
  let scanned = $state<{ actors: number; items: number } | null>(null);
  /** Stand-ins already swapped in. Not rows, since there's nothing to do. */
  let alreadyReplaced = $state(0);
  let note = $state<{ ok: boolean; text: string } | null>(null);
  let replacing = $state<string | null>(null);
  /** Hits already swapped this session, so the row stops offering it. */
  let done = $state<Set<string>>(new Set());

  /** clientIds that answered; a ping is only sent to ones not yet confirmed. */
  const answered = new Set<string>();

  /** A silent world takes 5s to time out, longer than the poll; don't stack rounds. */
  let confirming = false;

  async function confirm(clients: BridgeClientInfo[]): Promise<void> {
    if (confirming) return;
    confirming = true;
    try {
      await Promise.all(
        clients
          .filter((c) => !answered.has(c.clientId))
          .map((c) =>
            pingFoundry(c.clientId).then(
              () => answered.add(c.clientId),
              () => answered.delete(c.clientId),
            ),
          ),
      );
      live = clients.filter((c) => answered.has(c.clientId));
      if (!live.some((c) => c.clientId === clientId))
        clientId = live.length === 1 ? live[0].clientId : '';
      checking = false;
    } finally {
      confirming = false;
    }
  }

  onMount(() => {
    void refreshFoundryStatus();
  });

  $effect(() => {
    if (!foundry.loaded) return;
    const clients = foundry.status.clients;
    untrack(() => void confirm(clients));
  });

  const client = $derived(live.find((c) => c.clientId === clientId));
  const tooOld = $derived(
    !!client && !(client.features ?? []).includes(BRIDGE_FEATURES.scan),
  );
  const canScan = $derived(
    !!client &&
      !tooOld &&
      (scope.characters || scope.npcs || scope.items) &&
      rules.length > 0 &&
      !scanning,
  );

  async function run() {
    scanning = true;
    error = '';
    try {
      // The world may have gone since it last answered; find out in seconds,
      // not after the scan's long timeout.
      try {
        await pingFoundry(clientId);
      } catch {
        answered.delete(clientId);
        throw new Error(
          `${client?.world ?? 'That world'} isn't answering. Check Foundry is open, then try again.`,
        );
      }
      const result = await scanFoundry(clientId, scope, rules);
      rows = buildScanRows(result.hits, rules);
      alreadyReplaced = result.hits.filter((h) => h.state === 'replaced').length;
      scanned = result.scanned ?? null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      scanning = false;
    }
  }

  async function open(uuid: string, name: string) {
    note = null;
    try {
      await openInFoundry(clientId, uuid);
      note = { ok: true, text: `Opened ${name} in Foundry.` };
    } catch (e) {
      note = { ok: false, text: (e as Error).message };
    }
  }

  const canReplace = $derived(
    !!client && (client.features ?? []).includes(BRIDGE_FEATURES.replace),
  );

  async function replace(row: ScanRow) {
    const rule = rules.find((r) => r.id === row.hit.ruleId);
    if (!rule) return;
    replacing = row.hit.uuid;
    note = null;
    try {
      const result = await replaceInFoundry(clientId, row.hit.uuid, rule);
      done = new Set(done).add(row.hit.uuid);
      const lost = result.dropped
        ? ` ${result.dropped} activity ${plural(result.dropped, 'pin or favorite', 'pins or favorites')} had no match and were removed.`
        : '';
      note = {
        ok: true,
        text: `Replaced with ${result.name ?? rule.replacementName}.${lost}`,
      };
    } catch (e) {
      note = { ok: false, text: (e as Error).message };
    } finally {
      replacing = null;
    }
  }

  const report = $derived(client ? enforcementStatus(client) : null);

  const typeLabel = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : '');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}></div>

<div class="modal" role="dialog" aria-modal="true" aria-label="Scan Foundry">
  <header>
    <h2>Scan Foundry</h2>
    <button class="icon" onclick={onclose} aria-label="Close"
      ><i class="fa-sharp-duotone fa-regular fa-xmark" aria-hidden="true"
      ></i></button
    >
  </header>

  {#if rows === null}
    <div class="body">
      {#if checking}
        <p class="muted">Checking the Foundry connection.</p>
      {:else if !live.length}
        <p class="muted">
          No Foundry world is answering. Open a world with the Homebrew Manager
          Bridge module enabled. Just after the manager starts, the module can
          take up to 30 seconds to reconnect; this updates on its own.
        </p>
      {:else if live.length > 1}
        <label class="field">
          World
          <select bind:value={clientId}>
            <option value="">Choose a world.</option>
            {#each live as c (c.clientId)}
              <option value={c.clientId}>{c.world}</option>
            {/each}
          </select>
        </label>
      {:else}
        <p class="muted">World: <b>{live[0].world}</b></p>
      {/if}

      <fieldset>
        <legend>What to search for replacements?</legend>
        <label
          ><input type="checkbox" bind:checked={scope.characters} /> Player Characters</label
        >
        <label><input type="checkbox" bind:checked={scope.npcs} /> NPCs</label>
        <label
          ><input type="checkbox" bind:checked={scope.items} /> Items</label
        >
        <p class="hint">
          Matches by name and original source, in each actor's items and
          containers, and in the world's Items.
        </p>
      </fieldset>

      <p class="muted">
        {formatNumber(rules.length)}
        {plural(rules.length, 'mapping', 'mappings')} to look for, including unsaved
        ones.
      </p>
      {#if report}
        <div class="enforce">
          <StatusText variant={report.variant}>{report.text}</StatusText>
          <span class="hint"
            >Players who add a superseded item get its replacement instead, with
            a chat message the sheet's owner or a GM can confirm or override.
            The world enforces the saved mappings; turn it on or off in
            Foundry's module settings.</span
          >
        </div>
      {/if}
      {#if tooOld}
        <p class="bad">
          The bridge module in this world is too old to scan. Deploy it from
          Settings, then reload the world.
        </p>
      {/if}
      {#if error}<p class="bad">{error}</p>{/if}
    </div>
    <footer>
      <Button onclick={onclose}>Cancel</Button>
      <Button variant="primary" disabled={!canScan} onclick={run}
        >{scanning ? 'Scanning.' : 'Scan'}</Button
      >
    </footer>
  {:else}
    <div class="toolbar">
      <span>
        {formatNumber(rows.length)}
        {plural(rows.length, 'hit', 'hits')}
        {#if scanned}&middot; looked through {formatNumber(scanned.items)}
          {plural(scanned.items, 'item', 'items')} on {formatNumber(
            scanned.actors,
          )}
          {plural(scanned.actors, 'actor', 'actors')}{/if}
        {#if alreadyReplaced}&middot; {formatNumber(alreadyReplaced)} already
          replaced{/if}
      </span>
      {#if note}<span class:bad={!note.ok} class:ok={note.ok}>{note.text}</span
        >{/if}
      <Button size="small" onclick={() => (rows = null)}>Back</Button>
    </div>
    <div class="scroll">
      {#if rows.length}
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Replaced content</th>
              <th>Replaced with</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.hit.uuid)}
              <tr>
                <td>{typeLabel(row.hit.docType)}</td>
                <td>
                  {row.hit.name}
                  <span class="where">{row.where}</span>
                </td>
                <td>{row.replaced}</td>
                <td>{row.replacedWith}</td>
                <td class="actions">
                  {#if done.has(row.hit.uuid)}
                    <span class="ok">Replaced</span>
                  {:else if row.hit.state === 'original' && row.hit.location.kind === 'actor'}
                    <Button
                      size="small"
                      variant="primary"
                      disabled={!canReplace || replacing !== null}
                      title={canReplace
                        ? 'Swap this for its replacement, keeping its place on the sheet'
                        : 'The bridge module in this world is too old to replace items.'}
                      onclick={() => replace(row)}
                      >{replacing === row.hit.uuid
                        ? 'Replacing.'
                        : 'Replace'}</Button
                    >
                  {/if}
                  {#if !done.has(row.hit.uuid)}
                    <Button
                      size="small"
                      onclick={() => open(row.hit.uuid, row.hit.name)}
                      >Open</Button
                    >
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="muted pad">Nothing in that scope is superseded.</p>
      {/if}
    </div>
  {/if}
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
    overflow-y: auto;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.75rem 1rem;
  }
  legend {
    padding-inline: 0.375rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .hint,
  .muted {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .bad {
    margin: 0;
    color: var(--danger);
  }
  .ok {
    color: var(--ok);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 1.25rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .toolbar :global(.button) {
    margin-inline-start: auto;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0 1.25rem 1.25rem;
  }
  .pad {
    padding-block: 1rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--bg-panel);
    text-align: start;
    padding: 0.5rem 0.625rem;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--text-faint);
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .actions {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }
  .enforce {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
  }
  .where {
    display: block;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
