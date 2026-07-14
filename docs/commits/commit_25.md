# Commit 25 — Detached windows: open apps and actions as real OS windows

## The request

Modal dialogs trap you in one window — you can't keep two apps' logs open to compare them, and
every action blocks the whole app behind a backdrop. The fix: make each app and each action a
real, independent OS window you can move, resize, and open several of.

## What this commit delivers

- **⧉ Open** on each app card → a dedicated, live-updating window for that one app.
- **Logs ⧉ / Edit ⧉ / Share… ⧉ / Manifest ⧉** each open in their own window. Logs windows are
  **not** deduplicated, so you can open several (different apps, or the same app) and arrange
  them side by side — the compare case that motivated this.
- **New app** opens in its own window too.
- Quick actions (scale ±, delete) stay inline on the card — they don't need a window.

Solo actions (app / edit / share / manifest / new) focus the existing window if you reopen
them; logs always open a fresh window.

## Architecture

- **Main process window manager** (`main.ts`): a `window:open` IPC handler creates a
  `BrowserWindow` loading `index.html?view=<kind>&app=<name>`, sized per kind, with the same
  sandboxed preload as the main window. Solo kinds are tracked in a map keyed by `view:app` so
  reopening focuses; logs are never tracked, so they stack.
- **One HTML, routed** (`renderer.ts`): the renderer reads `location.search`. No `view` →
  overview (main window). `view=app` → a "solo" window rendering just that app's card
  (reusing the overview card renderer, filtered) and live-polling. Other views → a "panel"
  window that hosts the matching dialog **full-screen** (`.show()` non-modal + `position:
  fixed; inset:0`), and closes the OS window when that dialog closes. This reuses every
  existing dialog and all the form/logs/share logic unchanged — no duplicated markup.
- The card's action buttons now call `window.kh.openWindow(kind, app)` instead of opening an
  in-page modal; the actual dialogs are opened only by a child window's own init. So the exact
  same button works from the overview and from a per-app window (where its Logs button spawns
  yet another window).

## Why reuse the dialogs instead of new pages

Each detached window loads the same `index.html` and shows exactly one dialog filling it. That
means the logs viewer, the wizard (with all its Easy/Developer fields and YAML preview), and
the share form behave identically whether they're a centered modal (they no longer are) or a
full window — zero logic forked, and the Easy/Developer mode still applies via `body[data-mode]`.

## Verification (live, multi-window, via CDP)

Deployed two apps and drove the real UI, then enumerated open windows through the DevTools
Protocol:

- Opened **Logs for `demo`**, **Logs for `sidecar`**, and **Open `demo`** → four independent
  windows coexisted: `kube-helper — 3 app(s)`, `Logs — demo`, `Logs — sidecar`,
  `demo — kube-helper`. Two separate logs windows at once is exactly the compare workflow.
- **Logs window**: `body.panel`, the dialog's width matched the window width (fills it), and
  the overview chrome (tagline) was hidden.
- **App-detail window**: `body.solo`, exactly one card, app name `demo`, and its own **Open**
  button hidden (you're already in that window).
- **Close-with-window**: clicking the logs dialog's Close removed that window from the list,
  leaving the others.
- **Edit window**: opened `Edit demo`, set replicas to 3, clicked Apply → the window closed
  itself and the main window then showed `demo 3/3`. (The CDP socket dropping mid-call is the
  window closing on success.)

## Next

Everything now lives in windows; a natural follow-up is remembering window positions/sizes per
kind, and a "Logs: follow all" arrangement helper.
