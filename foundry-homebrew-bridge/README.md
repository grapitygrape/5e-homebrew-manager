# Homebrew Manager Bridge

A Foundry VTT module (v13–v14, dnd5e) that connects a world to the
[Homebrew Manager](../README.md). With it the manager can:

- **Check Foundry**: show which entries in a homebrew file already exist in the
  world, and whether each has artwork, a description and Activities.
- **Open** a matched item's sheet in Foundry.
- **Replace** superseded items on character sheets, and swap them on import.
- **Send** from the Site Browser to the world directory or to an actor.

The world connects out to the manager. Foundry opens no port, and the manager
never calls into Foundry. [`docs/FOUNDRY-BRIDGE.md`](../docs/FOUNDRY-BRIDGE.md)
explains how that works.

## Install

1. In the manager, set **Settings → Deployment → Foundry Data folder** and save.
   The manager copies the module into `Data/modules/foundry-homebrew-bridge`, and
   recopies it whenever it changes. **Deploy bridge** does it on demand.
2. In Foundry, enable the module in your world and reload.

To work on the module, link it instead so edits show up on reload. The manager
won't copy over a link.

```powershell
New-Item -ItemType Junction `
  -Path   "<Foundry Data>\modules\foundry-homebrew-bridge" `
  -Target "<path-to-repo>\foundry-homebrew-bridge"
```

## Connect

A GM must be logged in to the world. The module connects to the desktop app
(`localhost:5051`) and the dev server (`localhost:5173`), whichever is running.
When it's connected, the manager's Files page shows a green
**Foundry: &lt;world&gt;** badge.

The manager only accepts worlds listed in its **Settings → Foundry URL**. If it
refuses one, click **Allow &lt;origin&gt;** next to the badge.

## Settings

World settings, GM only.

| Setting                             | Default         | Does                                                       |
| ----------------------------------- | --------------- | ---------------------------------------------------------- |
| Homebrew Manager URL                | `:5051, :5173`  | Managers to connect to, comma-separated.                   |
| Connect automatically               | on              | Connect when the world loads.                              |
| Replace superseded items on import  | on              | Add the replacement instead, and post a chat message to confirm or undo it. |
| Tell players about replaced items   | on              | Show a banner on the sheet of a replaced item.             |
| Search world Items                  | on              | Search the Items directory as well as compendiums.         |
| Exclude compendiums                 | _(empty)_       | Pack ids or prefixes to skip, e.g. `dnd5e.`                |
| Fuzzy name matching                 | on              | Fall back to close names. Those matches show as Ambiguous. |
| Fuzzy threshold                     | `0.72`          | Higher is stricter.                                        |
| Max matches per entry               | `8`             | Matches reported per homebrew entry.                       |
| Announce checks in chat             | off             | Post a notice on every check.                              |

Two menus sit in the module's settings. **Bridge Status** shows each
connection and has a **Rebuild index** button. **Scan Characters for
Replacements** finds replaced items on every character sheet and swaps the
ones you pick.

## Sending from the Site Browser

The desktop manager's Site Browser makes the site's **Send to Foundry**
buttons work without the Rivet extension. Pick where to send:

| Target                      | Takes                                        |
| --------------------------- | -------------------------------------------- |
| World directory             | Anything                                     |
| Player characters           | Anything but creatures, vehicles and objects |
| Parties, groups, encounters | Items, loot, coins, and spells as scrolls    |

Sending to an actor needs Neptunium active in the world. Creatures, vehicles
and objects always go to the world directory.

## Troubleshooting

| Problem                                | Fix                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Badge never turns green                | Open Bridge Status. **Refused**: click Allow in the manager. **Not running**: check the URL. |
| "Module is too old", or Send is greyed | Click **Deploy bridge** in the manager, then reload the world.            |
| "Did not answer within 15s"            | The GM's Foundry tab is in the background or busy. Bring it to the front. |
| New imports aren't found               | Click **Rebuild index** in Bridge Status.                                 |
| Everything shows Missing               | Check that **Exclude compendiums** doesn't cover your packs.              |

## Tests

The pure logic in `scripts/lib/` is tested by the manager's suite. Run
`npm test` from the repo root.
