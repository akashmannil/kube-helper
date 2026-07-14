# Commit 5 — `kh status`: app overview & replica detail

## What this commit delivers

- `kh status` (alias `kh ps`) — one row per app: name, readiness (running/desired, colored),
  image, published ports, age.
- `kh status <app>` — one row per replica: container name, state, Docker status line, ports.
- `src/ui.ts` gains a kubectl-style `table()` renderer and a compact `age()` humanizer.

```
$ kh status
NAME   READY   IMAGE          PORTS                          AGE
demo   2/2     nginx:alpine   18080->80/tcp, 18081->80/tcp   1m

1 app(s), 2 replica container(s)

$ kh status demo
REPLICA     STATE     STATUS         PORTS
kh-demo-0   running   Up 2 minutes   18080->80/tcp
kh-demo-1   running   Up 2 minutes   18081->80/tcp
```

## Design decisions

- **READY compares against *desired*, not observed.** The desired replica count is read from
  the `kh.spec` label on the containers (commit 4 stores the full spec there). If a replica
  container is deleted behind kh's back, status shows `1/2` in red — the truth — rather than
  a reassuring `1/1`. This is the same "status is a reconciliation report" philosophy as
  `kubectl get deploy`.
- **ANSI-aware column padding.** Colored cells (green/red readiness and state) embed escape
  codes; `table()` measures visible length with the codes stripped, otherwise colored columns
  drift out of alignment.
- **IPv4/IPv6 dedupe.** Docker reports `0.0.0.0:18080` and `[::]:18080` as two port entries;
  status collapses them to one `18080->80/tcp`.
- **Friendly empty states.** No apps → a hint showing the deploy command; unknown app name →
  error + how to list apps, exit 1 (scriptable).

## Bug found & fixed while verifying

First live run of `kh status demo` printed `18080->80/tcp, 18080->80/tcp` per replica — the
IPv4/IPv6 duplication above. Fixed by routing the detail view through the same deduplicating
`portSummary()` as the overview.

## Next commit

Commit 6 adds `kh scale <app> <replicas>` — resizing an app *without* its manifest file, using
the spec stored on the machine.
