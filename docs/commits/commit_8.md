# Commit 8 — `kh delete`: clean teardown (core lifecycle complete)

## What this commit delivers

- `kh delete <app>` (alias `kh rm`) — force-remove every replica container of one app.
- `kh delete --all` — remove every kh-managed app on the machine, reported per app.
- README refreshed with a "60-second tour" now that the whole core lifecycle exists.

```
$ kh delete sidecar
√ sidecar deleted (1 container(s) removed)

$ kh delete --all
√ demo deleted (2 container(s) removed)
```

## Design decisions

- **No confirmation prompt.** Same convention as `docker rm -f` and `kubectl delete`:
  non-interactive, scriptable, exit 1 with a clear message when the target doesn't exist.
  The blast radius is inherently limited — delete can only ever see containers labelled
  `kh.managed=true`, so it is impossible for it to touch containers kh didn't create.
- **`--all` and a name are mutually exclusive**, and naming nothing is an error rather than an
  implicit `--all` — the destructive-by-default interpretation would be the wrong surprise.
- **Replicas of one app are removed in parallel** (`Promise.all`); apps are reported one line
  each, so `--all` output stays readable.

## Core lifecycle — complete

With commit 8, the full loop a developer needs day-to-day works end to end:

```
kh doctor                      # is this machine ready?
kh validate -f app.yaml        # is my manifest right?
kh apply    -f app.yaml        # make it so (idempotent)
kh status   [app]              # what is running vs desired?
kh scale    app 5              # resize, no YAML at hand
kh logs     app -f             # one stream, all replicas
kh delete   app                # clean teardown
```

## Verification (live daemon)

Deployed a multi-doc manifest (two apps, `demo` ×2 + `sidecar` ×1 — multi-doc support from
commit 3 exercised for real): status showed `2 app(s), 3 replica container(s)`. Then:
`kh delete sidecar` removed 1 container; `kh delete nope` exited 1 with a hint;
`kh delete --all` removed the remaining app; `kh status` showed the friendly empty state; and
`docker ps -a --filter label=kh.managed=true` returned nothing — zero kh residue on the
machine, while the user's own unrelated containers were untouched throughout.

## Next

Phase 2 of the roadmap: per-app networks, volumes, health probes, the `kh watch` reconciler
daemon (true self-healing beyond Docker restart policies), rolling updates, and a built-in
load-balancing proxy — then packaging and the web dashboard.
