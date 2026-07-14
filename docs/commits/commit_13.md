# Commit 13 — `kh watch`: the self-healing reconciler daemon

## What this commit delivers

```
$ kh watch
• Reconciling every 10s — Ctrl+C to stop. Quiet means healthy.
[07:54:38] sick-app: restarted unhealthy: kh-sick-app-0
[07:54:40] healthy-app: 1 created
[07:54:40] web: 1 restarted
```

A long-running loop (`-i/--interval`, default 10 s) that re-derives every app's desired state
from its meta record and enforces it — the piece that turns kh from "a deployer" into "an
orchestrator". Per pass, per app:

1. **`applyApp` with the recorded spec** — recreates force-removed replicas, starts stopped
   ones, removes strays beyond the count. The reconciler *is* the apply engine; there is no
   second code path to drift out of sync.
2. **Restarts unhealthy replicas** (commit 11 probes), with a per-replica backoff
   (`--unhealthy-backoff`, default 60 s) so a permanently broken app is nudged once a minute,
   not hammered every pass.

`--once` runs a single pass and exits — composable with cron/Task Scheduler for machines where
a resident process is unwanted.

## Design decisions

- **Level-triggered, not edge-triggered.** Like Kubernetes controllers, each pass compares
  desired vs. actual from scratch instead of watching Docker events. Missed events, kh
  restarts, even actions taken while watch wasn't running — none of it matters; the next pass
  converges. (An event-driven fast path can be layered on later purely as a latency
  optimization.)
- **Quiet means healthy.** Passes that find nothing wrong print nothing; every line of output
  is an actual intervention with a timestamp. This is what you want from a daemon's journal.
- **Backoff state is in-memory only** — a Map of container name → last restart. Worst case
  after a watch restart is one extra restart of an already-unhealthy replica; not worth a
  state file (and `--once` therefore has no backoff memory, which cron users should know).
- **Daemon outages are survived, not fatal**: a failed pass warns and retries next interval,
  so a Docker Desktop restart doesn't kill the reconciler.
- **Division of labour with Docker restart policies**: `restart: always` (commit 4) already
  revives *crashing processes* instantly, with no kh involved. Watch handles what a restart
  policy cannot see: containers removed or stopped by a human, and probes failing inside a
  live process.

## Verification (live daemon)

With `kh watch -i 2` running: stopped `kh-web-0` (→ `1 restarted`), force-removed
`kh-healthy-app-0` — the app's **only** replica (→ `1 created`, resurrected purely from the
commit-12 meta record; impossible under the pre-meta design, which is exactly the failure that
motivated it). `sick-app` (probe `exit 1`) was restarted **once** across five passes — backoff
working. Final `kh status`: everything `1/1` except the deliberately sick app at `0/1`.

## Next commit

Commit 14: rolling updates — `kh apply` waiting for each replaced replica to come back
(healthy, when probed) before touching the next, making image upgrades zero-downtime for
multi-replica apps.
