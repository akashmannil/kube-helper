# Commit 9 — The `kh` network: DNS-based service discovery

## What this commit delivers

Every kh replica now joins one shared bridge network named `kh`, created on first deploy,
removed by `kh delete --all` when idle, reported by `kh doctor`. On it, two kinds of names
resolve via Docker's embedded DNS:

- **`http://<app>`** — every replica carries its app name as a network alias, so the app name
  resolves to the app's replicas (Docker returns replica IPs in rotating order — free, crude
  DNS round-robin). This is kh's miniature version of a Kubernetes Service.
- **`http://kh-<app>-<i>`** — container names resolve automatically on user-defined networks,
  giving stable per-replica addresses.

```
$ docker exec kh-sidecar-0 wget -qO- http://demo      # cross-app, by app name
<!DOCTYPE html> ... Welcome to nginx!

$ docker exec kh-demo-0 wget -q --spider http://kh-demo-1   # replica-to-replica
(exit 0)
```

## Design decision: one flat network, not per-app isolation

The original roadmap sketched "per-app isolated networks". Building it made clear that is the
wrong model for this tool, so the design changed deliberately:

- The dominant local use case is apps talking to each other — a web app finding its database.
  Per-app isolation breaks exactly that, and "fixing" it would require a cross-network linking
  feature invented from scratch.
- Kubernetes itself uses a flat network where everything can reach everything, with DNS names
  (Services) on top. kh copies the model that users' intuition already maps to: deploy `api`
  and `db` as two apps, and `api` reaches its database at `db:5432` — zero configuration.
- Isolation between a single developer's own apps on their own machine protects against
  nothing in practice; the default-bridge isolation from *non-kh* containers still holds.

ROADMAP.md item 9 was reworded accordingly.

## Implementation notes

- `src/docker/network.ts` — `ensureKhNetwork` (idempotent; note Docker's `name` filter is a
  substring match, so exact-name equality is checked) and `removeKhNetworkIfIdle` (used by
  `delete --all`; silently keeps the network if anything is still attached).
- Replicas join via `NetworkingConfig.EndpointsConfig` at creation with `Aliases: [app]` —
  aliases only work on user-defined networks, which the `kh` bridge is.
- The network is intentionally **not** part of the spec hash: it's infrastructure, not app
  identity. Existing containers from older kh versions simply migrate on their next replacement.

## Verification (live daemon)

Deployed `demo` (×2) + `sidecar` (×1): first apply printed `Created the shared "kh" network`;
`docker network inspect kh` showed 3 containers attached; the two DNS lookups above returned
real nginx responses across apps and between replicas. `kh delete --all` removed the containers
and printed `Removed the shared "kh" network`; doctor then reported it absent.

## Next commit

Commit 10 adds volumes to the manifest: per-replica managed volumes (safe for databases) and
host bind mounts, with data surviving replace/redeploy.
