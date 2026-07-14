# Commit 6 — `kh scale`: resize an app without its manifest

## What this commit delivers

`kh scale <app> <replicas>` — grow or shrink a running app from anywhere, no YAML file needed:

```
$ kh scale demo 4
√ demo scaled to 4: 2 created, 2 unchanged (4/4 replicas running)

$ kh scale demo 1
√ demo scaled to 1: 1 replaced, 3 removed, 1 unchanged (1/1 replicas running)
```

The command reconstructs the deployed spec from the `kh.spec` label (commit 4), overrides
`replicas`, and feeds it through the exact same `applyApp` reconciler — scale is just apply
with a different count, not a second code path.

## The design problem this commit solved

The commit-4 spec hash covered the *whole* spec, replica count included. Scaling 2→3 would have
changed the hash and **replaced every existing container** — a rolling restart just to add one
replica. Two changes fix this properly:

1. **Replica count is excluded from container identity.** `specHash` now hashes the spec minus
   `replicas`: the count is a property of the app, not of any single container. Scaling up
   creates only the missing replicas; existing ones are untouched (verified: `2 created,
   2 unchanged`).

2. **Scale-down "stamps" the new desired count.** Desired state is read from the *newest*
   container's `kh.spec` label. Creations and replacements record it automatically, but a pure
   scale-down only deletes — every survivor would still say "replicas: 4" and `kh status` would
   report a red `1/4` forever. So when a reconcile creates/replaces nothing yet the newest
   survivor's recorded count is stale, `applyApp` replaces that one container to write the new
   count. That is the `1 replaced` in the scale-down output: the deliberate, bounded (exactly
   one container) cost of having no state database. One-time hash-scheme migration aside, a
   no-op apply still replaces nothing.

## Semantics worth knowing

- Scale-down removes the **highest** replica indices, keeping auto-incremented host ports
  contiguous from the base port (18080, 18081, …).
- `kh scale app 0` removes every container — and since containers are kh's only state store,
  the app definition disappears with them (the command prints a note saying so). Scale-to-zero
  with a retained definition needs a state anchor; it is deferred to the reconciler-daemon work
  (roadmap #12) rather than half-solved here.
- Bad counts (`x`, `-1`, `3.5`, `>100`) are rejected with exit 1 before Docker is touched.

## Refactor

The "N created, M replaced" summary formatting moved to `formatApplyActions()` in
`src/commands/util.ts`, shared by `kh apply` and `kh scale`.

## Next commit

Commit 7 adds `kh logs <app>` — one merged, replica-prefixed log stream for the whole app,
with `--follow` and `--tail`.
