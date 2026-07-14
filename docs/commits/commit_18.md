# Commit 18 — Dashboard actions: scale & delete from the browser

## What this commit delivers

The dashboard becomes operational. Each app card gains three buttons — `− scale`, `+ scale`,
`delete` (with a confirm prompt) — backed by two new API endpoints:

- `POST /api/apps/<name>/scale` `{"replicas": n}` → runs the same reconcile as `kh scale`
- `DELETE /api/apps/<name>` → removes replicas + meta record

Unknown apps return 404, invalid counts 400, and every response is JSON with a clean `error`
message that the UI surfaces in a transient banner.

## Design decisions

- **One engine, two frontends — enforced by refactor.** The scale logic that lived inside the
  `kh scale` command moved to `src/engine/actions.ts` (`scaleApp`, `deleteApp`, and a typed
  `AppNotFoundError`); the CLI command and the HTTP route are now both ~5-line wrappers. The
  browser cannot behave differently from the terminal because there is nothing to diverge.
- **Deleting via the dashboard never touches volumes.** `deleteApp` always keeps managed
  volumes; destroying data remains a deliberate, flag-guarded CLI act
  (`kh delete <app> --volumes`). A misclick in a browser should never cost a database.
- **Buttons disable during an action** and the UI re-polls immediately after, so the page
  always shows post-action reality rather than an optimistic guess.
- **Still `127.0.0.1` by default** — now that the API mutates, the commit-17 default binding
  pays off. `--host` remains available for trusted-LAN use, documented as such.

## Verification (live daemon)

Against a dashboard serving `hello` (×2) and `hello-lb`:

- `POST /api/apps/hello/scale {"replicas":3}` → `{"ok":true,"result":{"created":1,…,"unchanged":2}}`;
  `/api/apps` then reported `desired: 3, ready: 3` with `kh-hello-2` seconds old.
- `DELETE /api/apps/hello-lb` → `{"ok":true,"removed":1}`; the app vanished from `/api/apps`.
- `DELETE /api/apps/nope` → HTTP 404.
- The served page contains the wired `scaleBy`/`removeApp` handlers and action buttons.

## The roadmap is complete

All 18 planned features shipped, one commit each, every one verified against a live Docker
daemon and documented in `docs/commits/`. What started as "a quick mix of docker+kubernetes
for a local device" now does: declarative manifests, replicas, reconciliation, service
discovery, volumes, health probes, self-healing, rolling updates, load balancing, a
single-file executable, and a web dashboard — on nothing but plain Docker.

Ideas beyond the original scope, should the project continue: `kh logs --since`, an events
stream (`kh events` / dashboard live-tail), multi-machine targets via `DOCKER_HOST` profiles,
resource limits in the manifest (cpu/memory), and a `kh init` manifest generator.
