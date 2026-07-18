# Roadmap

One functionality per commit. Every commit `N` is documented in `docs/commits/commit_N.md`.

## Phase 1 — Core CLI & orchestration engine

| # | Feature | Status |
| - | ------- | ------ |
| 1 | Project scaffold, TypeScript strict setup, `kh` CLI skeleton | ✅ |
| 2 | Docker Engine connection layer + `kh doctor` environment check | ✅ |
| 3 | Declarative YAML app manifest (`khapp.yaml`) + `kh validate` | ✅ |
| 4 | `kh apply` — declarative deploy with replicas & reconciliation | ✅ |
| 5 | `kh status` — app/replica overview across the machine | ✅ |
| 6 | `kh scale <app> <replicas>` — scale without a manifest file | ✅ |
| 7 | `kh logs <app>` — aggregated, prefixed logs across replicas (`--follow`) | ✅ |
| 8 | `kh delete <app>` — clean teardown of an app | ✅ |

## Phase 2 — Self-healing & production-ish features

| # | Feature |
| - | ------- |
| 9 | Shared `kh` network — DNS service discovery (`http://<app>` reaches replicas) ✅ |
| 10 | Volumes & persistent data in the manifest ✅ |
| 11 | Health checks in the manifest (exec/shell probes, k8s-style readiness) ✅ |
| 12 | Desired-state record — per-app meta container (kh's "Deployment object") ✅ |
| 13 | `kh watch` — reconciler daemon: restart dead replicas, enforce desired state ✅ |
| 14 | Rolling updates — zero-downtime image upgrades on `kh apply` ✅ |
| 15 | `kh expose` — built-in load-balancing proxy across an app's replicas ✅ |

## Phase 3 — Distribution & UX

| # | Feature |
| - | ------- |
| 16 | Single-file executable packaging (plug-and-play install) ✅ |
| 17 | Local web dashboard (read-only overview first) ✅ |
| 18 | Dashboard actions: scale / delete from the browser ✅ |

## Phase 4 — Desktop app (GUI for people who don't know Docker)

| # | Feature |
| - | ------- |
| 19 | Electron shell — desktop window, sandboxed UI over the same engine ✅ |
| 20 | "New app" wizard — deploy from an explained form, no YAML ✅ |
| 21 | Operate from the GUI — scale, logs, edit (rolling), delete, share on a port ✅ |
| 22 | Windows packaging — installable/portable desktop app ✅ |
| 23 | Fix: dialogs centered (CSS reset clobbered `<dialog>` margin:auto) ✅ |
| 24 | Easy / Developer mode toggle — plain language vs full Docker/k8s control ✅ |
| 25 | Detached windows — each app + Logs/Edit/Share/Manifest as its own OS window ✅ |
| 26 | The app explains itself — first-open welcome + "How it works" help window ✅ |
| 27 | v0.1.0 GitHub Release — downloadable desktop + CLI exes, README download links ✅ |

Further ideas live at the end of [docs/commits/commit_18.md](docs/commits/commit_18.md).
