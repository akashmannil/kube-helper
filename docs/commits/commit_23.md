# Commit 23 — Fix: dialogs pinned to the top-left instead of centering

## The bug

Every dialog in the desktop app (New app, Edit, Logs, Share) opened flush against the
top-left corner of the window instead of centered.

## Root cause

The renderer's CSS reset starts with `* { box-sizing: border-box; margin: 0; }`. A native
`<dialog>` is centered by the user-agent stylesheet via `margin: auto` on the element while
it's open — the universal `margin: 0` overrode exactly that, so the dialog collapsed to the
top-left. Nothing in the dialog's own rules put it back.

## Fix

One declaration: `dialog { margin: auto; ... }`, with a comment explaining why it must be there
so a future reset tidy-up doesn't delete it again. No JS, no layout hacks.

## Verification (live via CDP)

Opened the New app dialog and measured its bounding rectangle against the window:

```
left gap 272px == right gap 272px      top gap 44px == bottom gap 44px
```

Symmetric on both axes — centered. All four dialogs share the same `dialog` rule, so all four
are fixed.
