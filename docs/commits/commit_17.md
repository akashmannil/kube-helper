# Commit 17 — `kh dashboard`: a local web UI (read-only)

## What this commit delivers

```
$ kh dashboard
√ Dashboard on http://127.0.0.1:8787 (Ctrl+C to stop)
```

A dark, terminal-flavored single page listing every kh app — READY badge, image, published
ports, and a per-replica table with k8s-colored states (green ready / yellow running-but-
unhealthy / red down) — refreshing every 2 seconds, with engine info in the header and an
error banner if contact is lost.

Under it, a small JSON API anyone can script against:

- `GET /api/apps` — apps with desired/ready counts and replica detail
- `GET /api/info` — engine version, container/image counts

## Design decisions

- **Zero new dependencies.** The server is `node:http`; the page is one self-contained HTML
  string (inline CSS/JS, no framework, no CDN). The 88 MB single-file exe from commit 16 ships
  the dashboard for free, and nothing external is fetched at runtime — consistent with the
  offline, plug-and-play promise.
- **The dashboard is a *view*, not a second brain.** `/api/apps` is a thin serialization of
  the same `listApps()` the CLI uses; readiness, desired counts and health come from the
  engine layer, so CLI and browser can never disagree. (This is why commit 4 kept
  presentation out of the engine.)
- **Binds to `127.0.0.1` by default.** The API will gain mutating endpoints in commit 18, and
  a container-management API on `0.0.0.0` is a foot-gun. `--host` exists for people who mean
  it (e.g. a home server on a trusted LAN), and the flag's help text says as much.
- **Polling, not websockets.** At local scale a 2-second `fetch` of a label query is
  imperceptible; websockets would add connection lifecycle code for no observable gain.
  Same reasoning as `kh watch`'s level-triggered loop.

## Verification (live daemon)

With `hello` (×2) and its `hello-lb` proxy deployed: `GET /` returned the page (200,
`<title>kube-helper</title>`); `/api/apps` returned both apps with correct `ready: 2 / desired: 2`,
per-replica states and the LB's `18100->80/tcp`; `/api/info` reported engine 28.5.1. Server
runs until Ctrl+C; `EADDRINUSE` produces a clean one-line error suggesting `--port`.

## Next commit

Commit 18 makes the dashboard operational: scale and delete actions from the browser, over
POST/DELETE endpoints on this API.
