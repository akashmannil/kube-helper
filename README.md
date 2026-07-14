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
npm link            # puts `kh` on your PATH (or use: node dist/cli.js …)
```

## The 60-second tour

Describe an app in one small file:

```yaml
# khapp.yaml
apiVersion: kh/v1
kind: App
metadata:
  name: web
spec:
  image: nginx:alpine
  replicas: 2
  ports:
    - container: 80
      host: 8080        # replica 0 → 8080, replica 1 → 8081, ...
```

Then run it like a cluster — on your own machine:

```sh
kh doctor            # is this machine ready?
kh apply             # make reality match khapp.yaml (idempotent)
kh status            # NAME  READY  IMAGE  PORTS  AGE
kh scale web 5       # resize without the YAML file
kh logs web -f       # one live stream, every replica prefixed
kh delete web        # clean teardown
```

Edit the manifest and `kh apply` again: only genuinely changed replicas are replaced. Stopped
replicas restart. Excess replicas are removed. Crashed processes revive via Docker restart
policy. kh never touches containers it didn't create.

## Commands

| Command | Status | Description |
| ------- | ------ | ----------- |
| `kh --version` | ✅ commit 1 | Print the CLI version |
| `kh doctor` | ✅ commit 2 | Check Docker daemon reachability & machine readiness |
| `kh validate [-f file]` | ✅ commit 3 | Validate an app manifest without touching Docker |
| `kh apply [-f file]` | ✅ commit 4 | Declarative deploy: reconcile containers to the manifest |
| `kh status [app]` (`ps`) | ✅ commit 5 | Overview of all apps, or replica detail for one app |
| `kh scale <app> <n>` | ✅ commit 6 | Scale an app up/down — no manifest file needed |
| `kh logs <app> [-f] [-n N]` | ✅ commit 7 | Aggregated replica-prefixed logs, live with `--follow` |
| `kh delete <app> \| --all` (`rm`) | ✅ commit 8 | Remove an app's containers (only kh-managed ones) |

More commands land commit by commit — see [ROADMAP.md](ROADMAP.md).

## How this repo is written

Every feature is one commit, and every commit `N` is documented in
[`docs/commits/commit_N.md`](docs/commits/): what was built, the design decisions behind it, and
how it was verified. Read them in order and you can rebuild the tool from scratch.

## Requirements

- Node.js ≥ 20
- Docker Engine (Docker Desktop on Windows/macOS, `dockerd` on Linux)
