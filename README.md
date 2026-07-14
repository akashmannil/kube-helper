# kube-helper (`kh`)

**Plug-and-play container orchestration for a single machine.**

Kubernetes is powerful but heavy: control planes, etcd, YAML sprawl, cloud bills. Docker alone
is simple but imperative: no replicas, no self-healing, no declarative state. `kh` sits in the
middle — it gives you the *useful* parts of Kubernetes (declarative app manifests, replicas,
scaling, aggregated logs, self-healing) on top of the plain Docker Engine you already have on
your laptop or home server. No cluster. No cloud. One binary-style CLI.

## Why

Cloud costs keep pushing developers and small teams back to local infrastructure. What's missing
there is not compute — it's orchestration ergonomics. `kh` is that missing layer for a single
device or server.

## Quick start

```sh
npm install
npm run build
node dist/cli.js --help   # or: npm run dev -- --help
```

## Commands

| Command | Status | Description |
| ------- | ------ | ----------- |
| `kh --version` | ✅ commit 1 | Print the CLI version |
| `kh doctor` | ✅ commit 2 | Check Docker daemon reachability & machine readiness |
| `kh validate [-f file]` | ✅ commit 3 | Validate an app manifest without touching Docker |
| `kh apply [-f file]` | ✅ commit 4 | Declarative deploy: reconcile containers to the manifest |
| `kh status [app]` (`ps`) | ✅ commit 5 | Overview of all apps, or replica detail for one app |
| `kh scale <app> <n>` | ✅ commit 6 | Scale an app up/down — no manifest file needed |

More commands land commit by commit — see [ROADMAP.md](ROADMAP.md).

## How this repo is written

Every feature is one commit, and every commit `N` is documented in
[`docs/commits/commit_N.md`](docs/commits/): what was built, the design decisions behind it, and
how it was verified. Read them in order and you can rebuild the tool from scratch.

## Requirements

- Node.js ≥ 20
- Docker Engine (Docker Desktop on Windows/macOS, `dockerd` on Linux)
