# Commit 22 — Windows packaging: the desktop app as one portable exe

## What this commit delivers

```
npm run dist   →   release/kube-helper 0.1.0.exe   (87 MB, portable)
```

electron-builder packages the Electron app for Windows: `dist/**` plus production
`node_modules` into an asar archive, wrapped in a portable single-file exe (double-click and
run — no installer, no admin rights, matching the project's plug-and-play ethos). An
NSIS installer is one config line away (`win.target: ["nsis"]`) when distribution needs Start
Menu entries.

With this, the delivery story is complete for both audiences:

| Audience | Artifact | From |
| --- | --- | --- |
| Developers | `kh.exe` CLI (Node SEA) | commit 16 |
| Everyone else | `kube-helper 0.1.0.exe` desktop app | this commit |

Both talk to the same Docker Engine with the same labels — installable side by side, always in
agreement.

## Notes & decisions

- **`npmRebuild: false`** — kh has no native production dependencies (ssh2's optional native
  bindings are unused fallback paths), so skipping the rebuild step makes packaging faster and
  more reproducible.
- **Portable over installer as the default target**: zero-commitment trial matches the
  project's audience; the exe self-extracts on first run.
- The default Electron icon is used — a real release would drop an `icon.ico` in `build/` (one
  line of config). Signing is dev-signed only; production would need a code-signing cert, same
  caveat as the commit-16 SEA binary.
- The `release/` directory is git-ignored, like `dist-bin/`.

## Verification (live)

Launched `release/win-unpacked/kube-helper.exe` (the exact app inside the portable exe) with a
CDP port while three apps were deployed: the window title reported
**`kube-helper — 3 app(s)`** — live engine data through the fully packaged stack (asar,
packaged node_modules, production preload). Machine cleaned afterwards with
`kh delete --all --volumes`.

## Phase 4 complete

The question that opened this phase — *"can this be a Windows native app where commands are
GUI-based, interactive, editable, and explained, so users don't need to learn kube or
Docker?"* — is answered in four commits: Electron shell over the unchanged engine (19), a
wizard that replaces YAML with explained forms and a one-click sample (20), every operation as
an explained button with lossless GUI-edits (21), and a double-clickable Windows artifact (22).
