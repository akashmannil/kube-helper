# Commit 11 — Health checks: probes in the manifest, readiness in status

## What this commit delivers

```yaml
spec:
  healthcheck:
    exec: ["wget", "-qO-", "http://127.0.0.1/"]   # argv form (no shell), or:
    # shell: "curl -fsS http://127.0.0.1/health || exit 1"
    intervalSeconds: 10     # default
    timeoutSeconds: 3       # default
    retries: 3              # default
    startPeriodSeconds: 5   # default
```

Probes compile to Docker `HEALTHCHECK`s (`CMD` / `CMD-SHELL`, durations in nanoseconds), so the
*Engine* runs them — probing continues even when no kh process exists, and any Docker tooling
sees the same health state. On top, `kh status` now reports Kubernetes-style **readiness**:
READY counts replicas that are *running and healthy*, not merely running.

## Design decisions

- **Ready ≙ running ∧ (no probe ∨ healthy).** Defined once on `ManagedContainer.ready` in
  `state.ts`; both status views consume it. Apps without a healthcheck behave exactly as
  before. The detail view colors states green (ready) / yellow (running but starting or
  unhealthy) / red (not running) — a yellow "running" is precisely the "it's up but it's not
  okay" signal that plain Docker never gives you.
- **Health parsed from the list endpoint's status line** (`"Up 10 seconds (unhealthy)"`)
  rather than one `inspect` round-trip per container — status stays a single API call no
  matter how many replicas exist.
- **`exec` and `shell` forms, exactly one required** — same mutual-exclusion pattern (zod
  `refine`) as volumes' `name`/`host`. No `http:` probe form: unlike Kubernetes (where the
  kubelet probes from outside), a Docker HEALTHCHECK runs *inside* the container, so an http
  probe would silently require curl/wget in the image anyway — better to make that explicit.
- **Probes don't heal anything yet — deliberately.** Docker only flags unhealthy; acting on it
  (restarting the replica) is an orchestration decision that belongs to the `kh watch`
  reconciler in commit 12. One concern per commit.

## Verification (live daemon)

Deployed `healthy-app` (nginx, wget probe every 2 s) and `sick-app` (alpine `sleep 600`, probe
`shell: "exit 1"` every 1 s, 2 retries):

```
immediately after apply:   healthy-app 0/1    sick-app 0/1     (both starting)
after probes ran (~8 s):   healthy-app 1/1    sick-app 0/1

$ kh status sick-app
REPLICA         STATE     STATUS                      PORTS
kh-sick-app-0   running   Up 10 seconds (unhealthy)   -
```

The 0/1 → 1/1 transition for the healthy app and the permanent red 0/1 with a yellow
`running (unhealthy)` replica for the sick app are exactly the k8s readiness semantics.

## Next commit

Commit 12 is the self-healing piece: `kh watch`, a reconciler daemon that re-applies desired
state on an interval — recreating deleted replicas, starting stopped ones, and restarting
unhealthy ones.
