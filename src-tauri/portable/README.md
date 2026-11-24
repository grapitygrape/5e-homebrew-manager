# 5e Homebrew Manager (portable)

Run `homebrew-manager.exe`. Nothing to install.

| Path | What it is |
| --- | --- |
| `portable` | Empty file that makes this a portable copy. Keep it: without it, the app keeps its settings in `%APPDATA%\5e Homebrew Manager` instead. |
| `data\` | Everything this copy saves: settings (`hbm-config.json`), fonts, deploy scripts, content and browser data. Copy the whole folder to move your setup. Each subfolder's README says what goes in it. |
| `data\.env.example` | Copy it to `data\.env` and fill in the tokens your deploy scripts need. |
| `guides\`, `deploy-modules\`, `foundry-homebrew-bridge\` | Part of the app. A new version's zip replaces them, so don't edit them. |

The first run opens Setup with empty settings. To update, unzip the new
version and copy your `data\` folder into it.

The licensed fonts can't ship with the app. Put your own copies in
`data\fonts\`; its README lists the file names. Until then the app uses
Nodesto Caps Condensed.
