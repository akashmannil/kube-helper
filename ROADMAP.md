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

**All 18 roadmap items shipped.** Ideas for a Phase 4 live at the end of
[docs/commits/commit_18.md](docs/commits/commit_18.md).
