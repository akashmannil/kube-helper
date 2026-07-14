# Commit 19 — Desktop app: Electron shell & plain-language overview

## Why Electron (the "can this be a Windows native app?" decision)

The whole kh engine — dockerode, the reconciler, zod schemas — is Node code. The candidates:

| Option | Verdict |
| ------ | ------- |
| **Electron** | Main process *is* Node → `src/engine/*` imports unchanged. One codebase, three frontends. ✅ |
| Tauri | Lovely small binaries, but the backend is Rust; our engine would need to run as a sidecar process with an IPC protocol on top — all cost, no gain here. |
| NW.js / Neutralino | Declining ecosystem / no real Node backend respectively. |

So: the GUI is a **third frontend** over the same engine as the CLI (commit 1–15) and the web
dashboard (commit 17). Nothing was forked.

## What this commit delivers

`npm run gui` opens a desktop window with:

- A **Docker status pill** and, when the daemon is down, a friendly card: *"kube-helper uses
  Docker — the program that actually runs your apps in the background. Open Docker Desktop from
  the Start menu, wait until it says 'Engine running', then press retry."* No jargon, an action
  to take, and a retry button.
- The **app overview**, worded for newcomers: readiness is *"2 of 2 copies running"*, replicas
  are *"copies"*, port links are *"reachable at localhost:18080"* and open in the real browser.
  Hover titles explain what an image is and why copies exist. Scaled-to-zero apps read
  *"Paused"*.
- 2.5 s auto-refresh, error banner, and `document.title` reflecting the app count.

## Architecture

- `src/electron/main.ts` — compiled by the same `tsc` build as the CLI; registers IPC handlers
  (`docker:status`, `apps:list`, `shell:open`) that call the engine directly. Every handler
  returns a `{ok, data|error}` envelope: rejected `invoke` promises stringify horribly, typed
  envelopes keep error text presentable.
- `src/electron/preload.ts` — sandboxed `contextBridge` exposing only whitelisted calls as
  `window.kh`. The renderer has **no** Node, Docker, or filesystem access; `shell:open` even
  re-validates in the main process that URLs are localhost-only.
- `src/electron/renderer/` — vanilla TS + one HTML file (CSP `default-src 'self'`), bundled by
  esbuild via `scripts/build-gui.mjs`; DOM code is type-checked by a separate
  `tsconfig.gui.json` so the Node-side build stays DOM-free.
- New `src/engine/view.ts` — the app/engine serializers extracted from the web dashboard so
  browser and desktop render the *same* truth (the dashboard was refactored onto it).

## Two launch gotchas worth recording

- `import { app } from "electron"` in an ESM main can fail named-export detection; the robust
  form is a default import + destructure.
- **`ELECTRON_RUN_AS_NODE=1` in the parent environment** (set by VSCode-hosted shells) makes
  electron.exe behave as plain Node, where `require("electron")` is just a path string — the
  app dies with `app is undefined`. Clearing the variable before launch fixes it.

## Verification (live)

With one app deployed, launched via `electron . --remote-debugging-port=9222` and queried the
DevTools Protocol: the page target reported title **`kube-helper — 1 app(s)`** — that title is
set by the renderer only after a successful renderer → preload → IPC → engine → Docker round
trip, so the whole stack is proven, not just the window.

## Next commit

Commit 20: the "New app" wizard — deploy from a form with every field explained, no YAML in
sight (plus a one-click sample app for instant first success).
