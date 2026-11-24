# Homebrew Manager data folder

Your settings and your own files for the site. The app writes these READMEs
each time it starts, so edits to them are replaced.

| Path | What it holds |
| --- | --- |
| `hbm-config.json` | Your settings. Change them in the app's Settings page. |
| `.env` | Optional. `NAME=value` lines passed to your deploy scripts, such as API tokens. Copy `.env.example` to start one; the app only reads it. |
| `fonts/` | Licensed fonts the site theme uses. See its README. |
| `scripts/` | Your deploy scripts. See its README. |
| `content/` | Your content files: the home page and Replace Content's list. See its README. |
| `known-sources.json` | Written by the app. The sources it has already seen, so it can warn about new ones. |
| `webview/` | Portable copy only. The app window's browser data. |

Copy this whole folder to move your setup to another machine. Keep `.env`
private: it holds your tokens.
