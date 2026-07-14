# Commit 2 — Docker Engine connection layer & `kh doctor`

## What this commit delivers

- `src/docker/client.ts` — the single place where kh connects to the Docker Engine API.
- `src/labels.ts` — the label vocabulary through which kh will recognise its own containers.
- `kh doctor` — a preflight command that tells the user in seconds whether their machine is
  ready, and exactly what to fix if it isn't.
- `src/ui.ts` — tiny colored-output helpers (native `util.styleText`, zero extra dependencies).

## Design decisions

### Talk to the Engine API directly, never shell out to `docker`

`dockerode` speaks the Docker Engine REST API over the local endpoint. Compared to spawning the
`docker` CLI this gives typed structured responses, real error objects, streaming APIs (needed
for `logs --follow` and image pulls later), and no dependency on the CLI being on `PATH` — only
the daemon must exist. That is the plug-and-play contract: *if Docker runs, kh runs.*

### Endpoint resolution mirrors the docker CLI

1. `DOCKER_HOST` if set — `unix://`, `npipe://`, `tcp://`, `http(s)://` all supported, so kh can
   also manage a remote box (e.g. a home server) without any extra feature work.
2. Otherwise the platform default: `//./pipe/docker_engine` on Windows,
   `/var/run/docker.sock` elsewhere.

The doctor command prints which endpoint was chosen, so misconfiguration is visible instead of
mysterious.

### Labels are the only state store

kh deliberately has **no database**. Every container it creates will carry labels
(`kh.managed`, `kh.app`, `kh.replica`, `kh.spec`, `kh.spec-hash`) that fully describe what it is
and how it should look. Consequences:

- Desired state can always be reconstructed by querying Docker — nothing to corrupt, migrate or
  back up.
- kh never touches containers it didn't create: every management query filters on
  `kh.managed=true`. Your hand-run containers are invisible to it (doctor already demonstrates
  this: the machine had 12 containers, kh reports 0 managed).
- Multiple tools/terminals stay consistent because Docker itself is the shared source of truth.

### Interactive calls get a timeout, long-running calls don't

`doctor` uses a 5 s per-request timeout so a hung daemon fails fast with a hint
("Start Docker Desktop…"). The default client used by later commands (pull, logs --follow) has
no timeout, because those requests legitimately run for minutes.

## Verification (live daemon)

```
$ node dist/cli.js doctor
• Docker endpoint: npipe:////./pipe/docker_engine
√ Docker daemon is reachable
√ Engine 28.5.1 (API 1.51) on linux/amd64
√ 6/12 containers running, 46 images present
• 0 kh-managed container(s) on this machine
√ Ready to run kh apps
```

With the daemon stopped, the same command exits 1 and prints the connection error plus a
platform-specific hint.

## Next commit

Commit 3 defines the declarative app manifest (`khapp.yaml`) — the small YAML file users write —
with zod-validated schema and a `kh validate` command producing precise, human errors.
