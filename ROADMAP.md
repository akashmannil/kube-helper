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
| 9 | Per-app isolated Docker network |
| 10 | Volumes & persistent data in the manifest |
| 11 | Health checks in the manifest (exec/http probes) |
| 12 | `kh watch` — reconciler daemon: restart dead replicas, enforce desired state |
| 13 | Rolling updates — zero-downtime image upgrades on `kh apply` |
| 14 | Built-in reverse proxy / load balancer across replicas of an app |

## Phase 3 — Distribution & UX

| # | Feature |
| - | ------- |
| 15 | Single-file executable packaging (plug-and-play install) |
| 16 | Local web dashboard (read-only overview first) |
| 17 | Dashboard actions: scale / restart / delete from the browser |
