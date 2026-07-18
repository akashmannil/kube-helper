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

Or build the self-contained executable — one file, no Node.js needed on the target machine:

```sh
npm run package     # → dist-bin/kh.exe (Windows) or dist-bin/kh
```

## The desktop app (no Docker knowledge required)

There's also a full GUI — the same engine with every command as an explained, editable form:
deploy from a wizard instead of YAML, scale with +/− buttons, view logs, edit apps with rolling
updates, share an app behind one load-balanced address, all with plain-language help
("copies" instead of replicas, "app package" instead of image).

A header **Easy / Developer** toggle switches between that plain-language experience and full
Docker/Kubernetes terminology with every advanced option (custom command, port protocol,
volume type, health-probe tuning, restart policy) plus a one-click **Manifest** view showing
the exact `khapp.yaml` to deploy the same thing from the CLI.

Every app and every action opens in its own resizable OS window: **⧉ Open** gives an app its
own live window, and **Logs / Edit / Share / Manifest** each detach so you can open several at
once — e.g. two apps' logs side by side to compare.

The app also explains itself. On first open (before any app exists) the window teaches the
whole idea in three steps, previews the live card every app becomes, and offers the sample as
the first click. A header **?** opens *How kube-helper works* in its own window: the reconcile
loop drawn out, an Easy↔Developer dictionary, what every button does, and a "when something
misbehaves" list — with its own Easy/Developer switch, so the guide rewrites itself in
whichever language you're learning.

```sh
npm run gui         # develop: opens the desktop window
npm run dist        # ship:   → release/kube-helper 0.1.0.exe (portable Windows app)
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

Apps find each other by name: every replica joins the shared `kh` network, where
`http://<app>` resolves to that app's replicas (commit 9) — deploy `api` and `db`, and `api`
just connects to `db:5432`.

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
| `kh watch [-i sec] [--once]` | ✅ commit 13 | Self-healing reconciler: recreate, restart, heal |
| `kh expose <app> <port>` | ✅ commit 15 | Load-balancing proxy for an app on one stable host port |
| `kh dashboard [-p port]` | ✅ commits 17–18 | Local web UI + JSON API: overview, scale & delete |

More commands land commit by commit — see [ROADMAP.md](ROADMAP.md).

## How this repo is written

Every feature is one commit, and every commit `N` is documented in
[`docs/commits/commit_N.md`](docs/commits/): what was built, the design decisions behind it, and
how it was verified. Read them in order and you can rebuild the tool from scratch.

## Requirements

- Node.js ≥ 20
- Docker Engine (Docker Desktop on Windows/macOS, `dockerd` on Linux)
