# Commit 10 — Volumes: persistent data in the manifest

## What this commit delivers

Two kinds of storage in `spec.volumes`, mixed freely:

```yaml
spec:
  volumes:
    - name: data                      # managed volume — kh creates kh-<app>-data-<i>
      mount: /var/lib/postgresql/data
    - host: ./www                     # bind mount — host path, relative to the manifest
      mount: /usr/share/nginx/html
      readOnly: true
```

Plus lifecycle handling: `kh delete <app>` **keeps** managed volumes by default (with a hint),
`kh delete <app> --volumes` removes them — and works even after the containers are already
gone, so orphaned data is always recoverable *and* removable. `examples/postgres.yaml` shows
the flagship use case.

## Design decisions

- **Managed volumes are per replica** (`kh-<app>-<name>-<i>`), never shared. Two postgres
  replicas writing one data directory is corruption, not high availability — the same reason
  Kubernetes StatefulSets give each pod its own PVC. Bind mounts, by contrast, are naturally
  shared (config files, static content).
- **Deterministic names make data survive replacement.** A replaced replica remounts
  `kh-<app>-<name>-<i>` by construction — verified live: the writer app's log had 32 lines,
  a spec change replaced the container, and the log kept growing to 42 with history intact.
- **Bind paths are absolutized at load time, against the manifest's directory.** The spec is
  stored on containers and replayed later by `kh scale` (and soon `kh watch`) from arbitrary
  working directories with no file around — a relative `./www` stored verbatim would silently
  bind the wrong directory. Absolutizing is a load-time concern, so it lives in the manifest
  loader, not the engine.
- **Structured `HostConfig.Mounts`, not `Binds` strings** — Windows host paths contain colons
  (`D:\...`), which corrupt the `src:dst:ro` string format. Verified with a real `D:`-drive
  bind serving nginx content over HTTP.
- **Deleting data is always explicit.** Docker's own `docker volume ls` shows kh volumes via
  their `kh.*` labels; nothing is removed unless the user says `--volumes`.

## Bug found & fixed while verifying

First deploy of the writer app crashed apply with `Cannot read properties of null (reading
'map')`: for containers with **no exposed ports at all** (alpine, unlike nginx) the Engine
returns `Ports: null` instead of `[]` in container lists. Every earlier test app happened to
expose a port. Fixed in `state.ts` with a null-coalesce; volumes themselves were fine.

## Verification (live daemon)

- Managed volume: `writer` (alpine loop appending `date` to `/data/log.txt`) accumulated lines;
  spec change → `1 replaced`; line count continued from 32 to 42 — data survived.
- Bind mount: `web` served `<h1>hello from a kh bind mount</h1>` from a Windows host directory
  on port 18090, read-only.
- Lifecycle: `kh delete writer` kept `kh-writer-data-0` and printed the removal hint;
  `kh delete writer --volumes` (after the app was gone) removed it; label-filtered
  `docker volume ls` confirmed both states.

## Next commit

Commit 11 adds health checks to the manifest — exec/shell probes mapped to Docker
HEALTHCHECKs, with `kh status` readiness counting only healthy replicas.
