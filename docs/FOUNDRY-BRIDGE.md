# Foundry bridge — architecture

How the manager's **Check Foundry** button works, and why it's built inside-out.

For install and usage, see
[`foundry-homebrew-bridge/README.md`](../foundry-homebrew-bridge/README.md).

---

## The constraint

The obvious design — manager `GET`s a Foundry URL — is impossible, and it's worth
being precise about why so nobody re-proposes it:

- A Foundry **module is client-side ESM**. It runs in the browser tab. It cannot
  open a socket, add an Express route, or run in Foundry's Node process.
- Foundry exposes **no HTTP API for document contents**. Since v11 compendium
  packs are server-side LevelDB, reachable only over its authenticated socket.
  There is no `/api/items` to call and a module cannot add one.

So the manager cannot pull. It has to be pushed to.

## The inversion

```
Foundry world (browser)                         Manager (SvelteKit, node)
        │                                                 │
   ready hook                                             │
        ├── GET /api/foundry/stream?world=…&system=… ────►│ openStream()
        │                                                 │  registers client
        │◄── event: hello  { clientId } ──────────────────┤
        │◄── event: ping   {} every 25s ──────────────────┤
        │                                                 │
        │                                    [ user clicks Check Foundry ]
        │                                                 │ POST /api/foundry/check
        │                                                 │  readHomebrew(file)
        │                                                 │  buildCandidates()   ← pure
        │◄── event: query  { requestId, candidates } ─────┤  ask() → Promise
        │                                                 │
   runQuery()                                             │
   ├ match names against pack indexes                     │
   ├ load only the matched documents                      │
   └ inspect img / description / activities               │
        │                                                 │
        ├── POST /api/foundry/result { requestId, … } ───►│ deliver() → resolves ask()
        │                                                 │  buildReport()       ← pure
        │                                                 │  → FoundryReport to the UI
```

**Open in Foundry** rides the same stream: `POST /api/foundry/open` pushes
`event: command { requestId, action: 'open', uuid }`, the module opens that
document's sheet and pulls it to the front, then POSTs a `BridgeResult` to
`/api/foundry/result` like any query. The module lists `open` in its handshake
`features`, so the report can tell an outdated module apart from a broken one
instead of waiting out a timeout.

**Scan Foundry** and **Replace** (Replace Content) use the same command channel:
`action: 'scan'` (90s timeout, walking every actor/item using rules from
`engine/foundry/replacements.ts` and `scripts/lib/replacements.js` in
`scripts/scan.js`) and `action: 'replace'` (swaps an actor's item in place via
`scripts/replace.js`). Other v0.5.0 commands ride the same path: `ping`
(liveness check), `rules` (sync replacement rules to world settings),
`blocklist` (sync Neptunium's World Content Blocklist), `neptunium` (sync
Neptunium data-source settings), and `send` (desktop site-browser loot/item
imports). Worlds also report their active enforcement toggles via
`POST /api/foundry/state`. On desktop, UI actions go through Tauri's
`foundry_ask` and `foundry_command` rather than local HTTP routes.

The awaitable `ask()` in `lib/server/foundry-bridge.ts` is what makes the API
route read like ordinary async code despite the request and its answer arriving
on two unrelated HTTP connections.

## Where the code lives

| Path                                                                          | Role                                                                                                     |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/lib/engine/foundry/types.ts`                                             | The wire contract. Both sides' single reference.                                                         |
| `src/lib/engine/foundry/candidates.ts`                                        | **Pure.** Homebrew doc → things to look for. Owns the source-type → Foundry-subtype map.                 |
| `src/lib/engine/foundry/report.ts`                                            | **Pure.** Raw matches → judged report. Owns "best match", "gap", "ambiguous".                            |
| `src/lib/engine/foundry/replacements.ts`                                      | **Pure.** Replacement mappings → Foundry scan/enforcement rules.                                         |
| `src/lib/server/foundry-bridge.ts`                                            | In-memory client registry, SSE streams, pending-request map (Node web mode).                             |
| `src/routes/api/foundry/{stream,result,state,status}`                         | Bridge protocol endpoints called by the Foundry module (SSE stream, answers, enforcement state, probe).  |
| `src/routes/api/foundry/{check,open,ping,scan,replace,rules,blocklist,neptunium}` | Node-mode UI action & sync endpoints (check, open sheet, ping, scan/replace, rules/blocklist/Neptunium sync). |
| `src-tauri/src/foundry.rs`                                                    | Desktop bridge server on `:5051` (`stream`, `result`, `state`, `status`) + `foundry_*` Tauri commands.   |
| `src/hooks.server.ts`                                                         | CORS for `/api/foundry/*`, allowlisted to _Settings → Foundry URL_.                                      |
| `src/lib/foundry-client.ts`                                                   | Browser-side polling + fetch helpers.                                                                    |
| `src/lib/components/FoundryReportModal.svelte`                                | The report UI.                                                                                           |
| `foundry-homebrew-bridge/`                                                        | The Foundry module.                                                                                      |
| `src/lib/services/bridge-deploy.ts`                                           | Copies the module into Foundry's `Data/modules` from Settings.                                           |

Every judgement lives in the pure engine modules; the bridge only searches and
inspects. That's what makes the interesting behaviour testable without a running
Foundry.

## Two managers, one module

The dev server (`:5173`) and the desktop app (`:5051`) are separate processes
with separate client registries. The module's Homebrew Manager URL setting
takes a list, and its default names both, so a world shows up in whichever is
running without configuration. 1.0.0's single `http://localhost:5173` default
is migrated to the list on the GM's next load.

When a stream fails the module closes it and probes `/api/foundry/status` to
learn why, rather than letting `EventSource` retry blindly:

- **403** → refused. The 403 carries CORS headers so the module can read it.
  It warns once in Foundry and retries every 5s.
- **network error** → nothing listening. Backs off to 30s, quietly.

The pure parts (URL parsing, status precedence, retry pacing, reading a probe)
are in `foundry-homebrew-bridge/scripts/lib/connection.js`, tested from Vitest.

## Why the state is in memory

`foundry-bridge.ts` keeps everything in module-level `Map`s, per process. A
connection is only meaningful while both sides are up — there is nothing worth
persisting, and a restart is recovered by the module's own reconnect backoff.
Consequences to know about: a `vite dev` restart drops every client (they come
back within ~5s), and this will not work across multiple manager processes
behind a load balancer without a shared broker. Neither matters for one GM on
one machine.

## Security

`/api/foundry/*` is the only cross-origin surface in the app. `hooks.server.ts`
allows exactly the origins listed under _Settings → Foundry URL_ — not `*`.

With `*`, any page in any tab could open a stream (leaking your homebrew entity
names) and POST fabricated results into a pending check. The allowlist gives
that setting a real job beyond the Dashboard link.

An empty list means no cross-origin bridge at all. That's the safe default.

Each refusal is remembered for ten minutes (origin, handshake world name,
time), and the Files view shows an **Allow** button per refused origin, which
adds it to the list (`POST /api/settings/foundry-origins`). That route sits
outside `/api/foundry` on purpose, so an allowed Foundry page can't widen the
list itself. The world name is spoofable, so the button names the origin.
Anything that reaches the bridge's port can appear there; Allow only what you
recognise.

## Testing

```bash
npm test    # includes src/lib/engine/__tests__/foundry-{match,report}.test.ts
```

`foundry-match.test.ts` imports the _Foundry module's own_ `lib/match.js` and
`lib/inspect.js` across the repo boundary. That's deliberate: the matching and
inspection rules have one implementation, and it's the one that ships. Those two
files must stay free of `game` / `ui` / `document` for this to keep working.

`foundry-report.test.ts` covers the manager-side halves — candidate extraction
and report judgement — with no bridge involved.

## Extending

- **New homebrew type** → one entry in `TYPE_MAP` (`candidates.ts`). The module
  needs no change; it searches whatever it's handed.
- **Monsters / Actors** → `TYPE_MAP` supports `docClass: 'Actor'`, but
  `search.js` currently only indexes Item packs, and `system.activities` is
  meaningless for Actors. Expect to add a fourth check ("has items/attacks")
  and a second row shape.
- **A fourth check** → add the field to `FoundryMatch`, compute it in
  `lib/inspect.js`, add it to the `Gap` union and `gapsFor()`, then a column.
