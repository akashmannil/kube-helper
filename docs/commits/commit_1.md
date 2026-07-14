# Commit 1 — Project scaffold & CLI skeleton

## What this commit delivers

The foundation of `kube-helper`: a strict-TypeScript Node.js project with a working `kh`
command-line entry point (`kh --version`, `kh --help`), plus the repo conventions every later
commit builds on (one feature per commit, one `commit_N.md` per feature).

## The problem being solved (project vision)

Kubernetes solves orchestration but assumes a cluster and a budget. Docker solves packaging but
is imperative — nothing keeps your containers matching a desired state. On a single laptop or
home/office server there is no comfortable middle ground. `kh` will be that middle ground:

- **Declarative** — describe an app in one small YAML file (image, replicas, ports, env).
- **Orchestrated** — replicas, scaling, aggregated logs, and (later) self-healing and rolling
  updates.
- **Plug and play** — talks to the Docker Engine you already have; no control plane, no agents,
  no cloud account.

## Design decisions

| Decision | Choice | Why |
| -------- | ------ | --- |
| Language | TypeScript (strict) on Node.js | Installed on target machines, first-class Docker Engine client (`dockerode`), easy path to a web dashboard later, packageable as a single executable. |
| Module system | ESM (`"type": "module"`, `NodeNext`) | Modern default; matches Node ≥ 20. |
| CLI framework | `commander` | Battle-tested, subcommand-oriented — the CLI will grow like `kubectl` (one verb per commit). |
| Container runtime access | `dockerode` (added now, used from commit 2) | Speaks the Docker Engine REST API directly over the local socket/named pipe — no shelling out to `docker` CLI, so output is structured and errors are typed. |
| Manifest tooling | `yaml` + `zod` (added now, used from commit 3) | YAML for human-friendly manifests, zod for schema validation with precise error messages. |
| Version source | `package.json` via `createRequire` | Single source of truth; works identically from `dist/` after compilation. |

## Repository layout

```
kube-helper/
├── src/
│   └── cli.ts            # CLI entry point (#!/usr/bin/env node, commander program)
├── docs/
│   └── commits/          # one commit_N.md per feature commit (this file)
├── package.json          # bin: { "kh": "dist/cli.js" }
├── tsconfig.json         # strict, ES2022, NodeNext, src → dist
├── README.md
└── ROADMAP.md            # full commit-by-commit plan
```

## Implementation notes

- `tsconfig.json` uses `strict` + `noUncheckedIndexedAccess` — array/record access must be
  null-checked, which matters when parsing untrusted manifest files later.
- `"types": ["node"]` had to be set explicitly: with `@types/node` v26 / TypeScript 7 the
  ambient Node types were not auto-included, producing `TS2591: Cannot find name 'process'`.
- The program uses `parseAsync` with a top-level `.catch` so every future subcommand can be an
  `async` action and still produce a clean one-line error + non-zero exit code instead of a
  stack trace.

## Verification

```
$ npm run build        # tsc — no errors
$ node dist/cli.js --version
0.1.0
$ node dist/cli.js --help
Usage: kh [options]
kube-helper — plug-and-play container orchestration for a single machine. ...
```

## Next commit

Commit 2 wires up the Docker Engine connection (`dockerode` over the platform socket / named
pipe, honouring `DOCKER_HOST`) and adds `kh doctor` — a preflight check that tells the user
whether their machine is ready.
