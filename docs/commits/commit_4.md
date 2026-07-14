# Commit 4 — `kh apply`: declarative deploy with reconciliation

## What this commit delivers

The core of kube-helper. `kh apply -f app.yaml` takes a manifest and makes reality match it:

- pulls the image if it isn't local (`src/engine/image.ts`)
- creates missing replicas as containers `kh-<app>-<i>` (`src/engine/apply.ts`)
- restarts stopped replicas whose spec is unchanged
- **replaces** replicas whose spec changed (detected by content hash)
- removes replicas beyond the desired count (scale-down)
- is idempotent: applying twice does nothing the second time

Supporting modules: `src/engine/hash.ts` (canonical spec hashing), `src/engine/state.ts`
(reconstructing app state from Docker labels), `src/commands/util.ts` (shared
daemon-connection / error UX).

## How reconciliation works

```
desired (manifest)                    actual (docker ps, filtered by kh labels)
  name, spec, replicas      vs         kh-<app>-<i> containers with kh.spec-hash label

for i in 0..replicas-1:
  no container           → create + start          "created"
  same hash, running     → leave alone             "unchanged"
  same hash, stopped     → start                   "restarted"
  different hash         → remove, create, start   "replaced"
containers with i >= replicas → remove             "removed"
```

The decision is O(1) per replica: compare the manifest's spec hash to the `kh.spec-hash` label.
The hash is a SHA-256 over a *canonical* JSON encoding (keys recursively sorted, defaults
already applied by the schema), so reordering YAML keys or writing an explicit
`restart: always` (the default) does **not** trigger a pointless redeploy — only real changes do.

## Design decisions

- **Replace, don't mutate.** Docker containers are immutable in the ways that matter (image,
  env, ports), so "update" is remove-then-recreate — the same pod-replacement model Kubernetes
  uses. Replacement is per-replica in index order, freeing each name/host-port before recreating.
- **The full spec is stored on the container** (`kh.spec` label, JSON). Later commands
  (`kh scale`, the reconciler daemon) can rebuild the desired state with *no manifest file
  present* — the machine itself is the database.
- **Fixed host ports auto-increment per replica.** `host: 18080` with 2 replicas publishes
  18080 and 18081 — replicas can't collide. Omit `host` and Docker picks free ephemeral ports.
- **`restart: always` (manifest default) doubles as crash-level self-healing.** Docker's own
  restart policy revives a *crashing* process even when no kh command is running; the future
  `kh watch` reconciler (roadmap #12) handles what a restart policy can't (a `docker rm`'d or
  manually stopped replica).
- **Engine code never prints.** `applyApp` reports via an optional status callback and returns
  a structured `ApplyResult`; the command layer decides presentation. This keeps the engine
  reusable by the future web dashboard.

## Verification (live daemon)

```
$ kh apply -f demo.yaml               # nginx:alpine, replicas: 2, host port 18080
√ demo reconciled: 2 created (2/2 replicas running)

$ kh apply -f demo.yaml               # idempotency
√ demo reconciled: 2 unchanged (2/2 replicas running)

$ curl -s -o /dev/null -w '%{http_code}' localhost:18080   → 200
$ curl -s -o /dev/null -w '%{http_code}' localhost:18081   → 200

$ docker stop kh-demo-0; kh apply -f demo.yaml
√ demo reconciled: 1 restarted, 1 unchanged (2/2 replicas running)

$ # add `env: {DEMO_FLAG: 1}` to the manifest, then:
$ kh apply -f demo.yaml
√ demo reconciled: 2 replaced (2/2 replicas running)
```

## Next commit

Commit 5 adds `kh status` — a kubectl-get-style overview of every kh app on the machine,
built entirely from the label-reconstructed state.
