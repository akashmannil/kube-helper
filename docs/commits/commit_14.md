# Commit 14 — Rolling updates: zero-downtime `kh apply`

## What this commit delivers

When `kh apply` replaces replicas (spec change), it now proceeds **one replica at a time and
waits for each new container to become ready** — running, and *healthy* when the app has a
probe — before touching the next. With ≥2 replicas, an image or config upgrade never takes the
whole app down:

```
$ kh apply -f web.yaml          # VERSION 1 → 2, two replicas, wget probe
• rolling update: replica 0 replaced, waiting until ready…
• rolling update: replica 0 is ready
• rolling update: replica 1 replaced, waiting until ready…
• rolling update: replica 1 is ready
√ web reconciled: 2 replaced (2/2 replicas running)     (12.5 s total — the probe latency ×2)
```

`--timeout <seconds>` (default 60) bounds how long each new replica may take.

## The failure path is the actual feature

A broken new version must not propagate. Readiness gating turns the probe into a canary:

```
$ kh apply -f web.yaml --timeout 8      # new version's probe always fails
• rolling update: replica 0 replaced, waiting until ready…
× Failed to apply "web": rolling update aborted: kh-web-0 not ready after 8s
  — remaining replicas keep the old spec                                (exit 1)

$ curl -so /dev/null -w '%{http_code}' localhost:18091   → 200   # replica 1: old version, serving
```

Recovery is free: re-applying the good spec replaced **only** replica 0 (`1 replaced,
1 unchanged`) because reconciliation is hash-based per replica — there is no separate
"rollback" machinery to build or trust.

## Design decisions

- **Replace-gating only.** Fresh creations (first deploy, scale-up) don't wait — nothing is
  being taken away, so readiness can converge in the background, exactly like a k8s Deployment
  creating pods. Only the destructive path (replacement) is serialized and gated.
- **Fail fast on death, not just timeout.** If the new replica lands in `exited`/`dead`
  (bad command, instant crash), the rollout aborts immediately instead of burning the timeout.
- **Interrupted rollouts finish themselves.** The meta record (commit 12) is written before
  any replica is touched, so a rollout killed halfway is completed by the next `kh apply` or
  `kh watch` pass — replicas with the old hash are simply still due for replacement.
- **A stuck rollout parks safely.** After an abort, the one new-version replica sits unhealthy
  (yellow in `kh status`), `kh watch` nudges it per its backoff, and the fix is simply applying
  a corrected manifest. Same operational shape as a k8s rollout stuck on a failing readiness
  probe.
- **Apps without probes still gate on `running`** — weaker (a process can be up and broken),
  but it preserves the one-at-a-time property. The probe is what buys real safety; commit 11's
  docs already push users toward one.

## Verification (live daemon)

All three paths exercised against Docker: the timed 2-replica rolling update above (sequential,
ready-gated), the aborted rollout with the old replica confirmed serving HTTP 200 mid-failure,
and the single-replica recovery apply. `kh status web` during the stuck state showed
`kh-web-0 running (unhealthy)` / `kh-web-1 running (healthy)` — the exact yellow/green picture
an operator needs.

## Next commit

Commit 15: a built-in load-balancing proxy, so one stable host port fans out across an app's
replicas.
