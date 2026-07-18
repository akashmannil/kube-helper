# Commit 27 — v0.1.0 GitHub Release: downloadable exes for the portfolio

## The request

The project is going on a portfolio, so a visitor needs a way to *run* it — a sample exe to
download, not a build pipeline to follow.

## What this commit delivers

- **GitHub Release `v0.1.0`** on `akashmannil/kube-helper` with both packaged binaries
  attached (built fresh from commit 26, so they include the welcome + help window):
  - `kube-helper-0.1.0-windows.exe` (87 MB) — the portable desktop app (electron-builder,
    commit 22's pipeline). Double-click, no install.
  - `kh-0.1.0-windows-cli.exe` (88 MB) — the single-file `kh` CLI (Node SEA, commit 16's
    pipeline). No Node.js on the target machine.
- Release notes in the app's voice: what it is, a downloads table, "before you run"
  (Docker Desktop prerequisite, SmartScreen "More info → Run anyway" for unsigned binaries,
  portable first-launch unpack delay), and a 60-second tour.
- **README "Download" section** ahead of Quick start with direct asset links and the same two
  caveats — a portfolio visitor's first click now needs zero tooling.

The binaries stay out of git (release/ and dist-bin/ were already ignored); GitHub Releases
is their home. Asset filenames are hyphenated copies (`kube-helper 0.1.0.exe` →
`kube-helper-0.1.0-windows.exe`) so download URLs carry no `%20`.

## Verification (both artifacts, live)

- `dist-bin\kh.exe --version` → `0.1.0`; `kh.exe status` talked to the running Docker engine
  and reported no apps — the SEA binary works standalone. (postject's "signature seems
  corrupted" warning is expected: injecting the blob invalidates the copied Node binary's
  Authenticode signature; the exe is unsigned, not broken.)
- Launched the packaged portable exe with `--remote-debugging-port` and drove it over CDP:
  fresh profile boots into **Easy mode** with the commit-26 welcome (3 steps, ghost card,
  all CTAs, `?` help button) — screenshot-confirmed, exactly what a first-time visitor sees.
  The portable launcher process exits after spawning the app; that's normal.
- `gh release view v0.1.0` after upload: release live with both assets.

## Next

A GitHub Actions workflow could rebuild both exes on tag push so future releases don't
depend on a dev machine; a macOS/Linux CLI build would widen the audience.
