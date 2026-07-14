# Commit 21 — Operate from the GUI: scale, logs, edit, share, delete

## What this commit delivers

Every day-2 operation the CLI offers is now a button on the app card, each with a hover
explanation in plain language:

- **− / +** — run one fewer/more copy ("added with no downtime").
- **Logs** — a viewer dialog ("what the app prints — the first place to look when something
  misbehaves"), lines tagged per copy, stderr in red, auto-updating while open.
- **Edit** — reopens the commit-20 wizard pre-filled from the *deployed* spec; submitting runs
  the same rolling, ready-gated apply as the CLI ("changes roll out one copy at a time").
- **Share…** — `kh expose` humanized: "puts all copies behind a single stable address and
  spreads visitors across them; new copies join by themselves."
- **Delete** — two-click confirm: the button arms to *"Sure? click again"* for 4 s. No native
  dialogs, no misclick disasters; the armed state survives the 2.5 s re-render because it
  lives in app state, not in the DOM.

## The design problem worth reading about: lossless GUI edits

The edit form can only show simple things (one port, one data volume, env, image, copies). But
an app deployed from the CLI may carry bind mounts, extra ports, a custom command or probe. A
naive "form → manifest" would silently strip all of that on save — the classic GUI-corrupts-
expert-config failure.

The fix: **edit merges over the deployed spec instead of replacing it.** The form starts from
a clone of the app's recorded spec and overrides only what its fields represent (first port,
the managed data volume by its actual name, env as shown, image, copies, probe presence — an
existing custom probe is kept, never overwritten by the synthesized wget one). Everything the
form can't show rides along untouched. GUI users and CLI users can share an app without
stepping on each other.

Other decisions:

- `exposeApp` moved from the `kh expose` command into `src/engine/actions.ts` — the third
  action (after scale/delete from commit 18) now shared verbatim between CLI and GUI.
- Log fetching reuses the commit-7 frame demuxer in the main process; the renderer receives
  structured `{replica, line, source}` rows, never raw Docker bytes.
- All mutation handlers re-validate their inputs in the main process — the renderer stays
  untrusted.

## Verification (live, through the real UI via Chrome DevTools Protocol)

Clicked actual buttons and read actual dialogs headlessly:

1. **+** on `gui-app` → polled to `3/3`.
2. **Logs** on `hello` → dialog contained 4 391 chars including `[kh-hello-0]` tags.
3. **Edit** on `gui-app`, set copies to 2, **Apply changes** → `2/2`; name field verified
   locked during edit.
4. **Share…** on `hello`, port 18300 → `hello-lb 1/1 18300->80/tcp`, and `localhost:18300`
   answered HTTP 200 from outside the app.
5. **Delete** on `my-first-app` → first click armed ("Sure? click again"), second click
   removed the app.

`kh status` afterwards agreed with the GUI on every count.

## Next commit

Commit 22 packages the desktop app for Windows with electron-builder, completing Phase 4.
