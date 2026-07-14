# Commit 12 — The desired-state record: a per-app meta container

## The bug that forced a better design

While testing the (then-unreleased) `kh watch` reconciler, this sequence broke:

```
kh scale healthy-app 2        # replica 1 is created, carrying "replicas: 2"
docker rm -f kh-healthy-app-1 # kill exactly that newest replica
# reconcile → healthy-app "heals" to ONE replica. Wrong.
```

Since commit 6, the desired replica count was read from the **newest** container's `kh.spec`
label. Kill precisely that container and the count time-travels backwards. The stamp-on-
scale-down hack from commit 6 was a symptom of the same root cause: *desired state was stored
on the workload it describes*.

## The fix: a meta container per app

Every app now has `kh-<app>-meta`: a container that is **created but never started** — no
process, no network (`NetworkMode: none`), no ports, just labels. It is kh's equivalent of a
Kubernetes Deployment object: the authoritative record of what the user asked for, decoupled
from the replicas that come and go. Still no database, no state files — everything lives in
Docker, reconstructible with `docker ps -a`.

`kh apply` writes the meta record **before** reconciling replicas (Kubernetes semantics: the
Deployment is saved first, controllers converge afterwards) — an interrupted apply leaves
behind the *intent*, and the next reconcile pass finishes the job.

## What this fixes / simplifies

| Before (newest-container-carries-truth) | After (meta record) |
| --- | --- |
| Killing the newest replica corrupts the desired count | Desired count survives any replica churn |
| Scale-down had to "stamp" by replacing one healthy survivor | Removed — scale-down now touches nothing it doesn't have to (`1 removed, 1 unchanged`) |
| Scale to 0 deleted the app definition entirely | 0-replica apps stay listed (`0/0`), `kh scale app 1` resurrects them from the record |
| Deleting all replicas behind kh's back = app gone | The meta record remains; reconcile recreates all replicas |

## Implementation notes

- New label `kh.role` (`replica` \| `meta`); `listManaged` hides metas by default so logs,
  status detail and reconcile loops keep operating on workloads only. New `listApps()` returns
  per-app `{spec, replicas, meta}` with the meta's spec authoritative and newest-replica labels
  as a legacy fallback, so pre-meta deployments keep working and acquire a meta record on
  their next apply/scale.
- The meta uses the app's own image (already pulled — and `ensureImage` now runs even for
  0-replica applies for exactly this reason) with `Entrypoint: ["true"]`; it costs one
  `Created`-state entry in `docker ps -a` and zero runtime resources.
- The meta is replaced only when the canonical JSON of the spec actually changed, so a no-op
  apply still recreates nothing.
- `kh delete` removes meta + replicas but reports replica counts (the record is an
  implementation detail); `--volumes` semantics unchanged.

## Verification (live daemon)

- Scale 2→1: `1 removed, 1 unchanged` — the commit-6 stamp replacement is gone.
- The original failing sequence: scale to 2, `docker rm -f` the newest replica, one reconcile
  pass → `1 created, 1 unchanged`, READY `1/2` until the new probe passes. Desired state
  survived the death of its former carrier.
- Scale to 0: status keeps the app as `0/0`; detail view explains; `kh scale healthy-app 1`
  brought it back from the record alone.

## Next commit

Commit 13 ships the reconciler this commit was built for: `kh watch`, the self-healing daemon.
