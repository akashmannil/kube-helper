# Commit 26 — The app explains itself: first-open welcome + "How it works" window

## The request

A new user opening the desktop app got a header, a "No apps yet." line, and silence. Nothing
said what the app *is*, what it delivers, or why any of the buttons matter. The ask: make the
UI explain itself visually on first open, and add a dedicated help section — in the app's own
voice, not boilerplate onboarding.

## What this commit delivers

### 1. First-open welcome (the empty state, grown up)

While no apps exist, the overview shows a welcome that teaches with the app's own parts
instead of a text wall:

- **The idea in three steps** — pick an app package → kube-helper runs copies → it stays
  running — as three panels, each dual-worded (`.easy-only`/`.dev-only`) like every other
  string in the GUI.
- **A "ghost" card** — a dashed, non-interactive replica of the card every app becomes
  (`my-blog · 2 of 2 copies running · ghost:5-alpine · localhost:8080`, real buttons and all),
  with a caption noting the − / + buttons genuinely add and remove running copies. The mock
  runs the Ghost blogging image, because of course it does.
- **Big CTAs** — *Run the sample app* (same IPC as the header button), *＋ New app*, and
  *How it all works →*. The welcome disappears the moment a real card exists and returns when
  the last app is deleted — no localStorage flag, no "dismiss" state to get stale.

### 2. A "How kube-helper works" window

A round **?** button in the header (and the hero's *How it all works →*) opens a new `help`
window kind — same detached-window architecture as commit 25, solo (reopening focuses).
Six sections, all dual-worded:

- **What this actually is** — Docker's sealed boxes, and kube-helper as the layer that "keeps
  it true"; in Developer mode, the no-database label architecture.
- **The loop that does all the work** — a drawn reconcile loop (desired vs observed state,
  with a `copy 1 crashed` example) plus the paragraph that carries the whole product:
  deploying/scaling/updating/crashing are all "a difference", fixed the same way.
- **Two languages, one dictionary** — an 8-row Easy↔Developer glossary (copy/replica,
  app package/image, settings/env, keep data/volume, reachable/published port, health
  check/probe, share/expose, paused/scaled to 0). The table is the Easy–Developer toggle,
  made legible.
- **The buttons, quickly** — every card action in one table, including "⧉ always means a real
  window".
- **The window and the terminal are the same tool** — GUI = CLI, with a `kh` command crib
  sheet in Developer mode.
- **When something misbehaves** — the five real failure modes (Docker not running, port
  allocated, first-pull slowness, crash-looping apps → read the red log lines, unhealthy
  copies) with what to actually do.

The help page carries **its own Easy/Developer toggle** with a line inviting the reader to
flip it and watch the page rewrite itself — "nothing else changes, which is the point."

## Implementation notes

- The mode machinery generalized from `#mode-toggle` to `.mode-toggle` (two instances now).
  `syncModeUi()` (body attribute + active states) split out of `applyMode()` so panel windows
  can sync at boot without `renderApps()` clobbering their window title.
- `deploySample(btn)` now takes the invoking button (header or hero) instead of hard-coding
  the header one.
- `help` joined `WINDOW_KINDS` in the main process (780×860, solo). `initPanel` shows the help
  dialog full-window and closes the OS window with it — the commit-25 pattern, unchanged.
- One bug caught by screenshot during verification: the old `#empty { text-align: center;
  color: var(--dim) }` rule survived alongside the new hero styles and centered/dimmed
  everything. Removed.

## Verification (live, via CDP)

Launched `electron . --remote-debugging-port=9223` (with `ELECTRON_RUN_AS_NODE` cleared —
the VSCode-hosted shell exports it, which makes Electron boot as plain Node and die on
`app.whenReady`) and drove the real windows over the DevTools protocol:

- Empty machine → hero visible with 3 steps, ghost card, all three CTAs; wording followed the
  saved mode, and flipping the header toggle re-worded the hero in place.
- **?** → a real `How kube-helper works` window (`body.panel`, dialog open, 6 sections,
  9-row glossary table). Its toggle booted in the saved mode; clicking *Developer* hid every
  `.easy-only`, revealed the CLI crib sheet, and persisted `kh-mode=dev`. Clicking **?** again
  focused the existing window — page list still showed exactly one help window.
- Hero **Run the sample app** → `my-first-app · 2 of 2 copies running` card appeared and the
  welcome hid; the card's two-click Delete removed it and the welcome returned. Screenshots
  confirmed the hero renders left-aligned in the app's normal type, ghost card dashed.

## Next

The ghost card could animate its badge (`0 of 2` → `2 of 2`) to preview self-healing; the help
window could deep-link (`?view=help&section=…`) so error banners can jump to their remedy.
