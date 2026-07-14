# Commit 15 — `kh expose`: a load-balancing proxy on one stable port

## What this commit delivers

```
$ kh expose hello 18100
√ hello exposed on http://localhost:18100 (proxy app "hello-lb" balancing to hello:80)
```

One stable host port that fans out across all replicas of an app — kh's version of a
Kubernetes Service + LoadBalancer. `--target-port` overrides the container port (default: the
first port in the app's spec, else 80).

## Design decision: the proxy IS a kh app

`kh expose` doesn't add a new runtime component — it synthesizes an app named `<app>-lb`
(nginx:alpine, 1 replica, restart always) and pushes it through the existing `applyApp`
pipeline. Everything already built applies to the balancer for free:

- `kh status` shows it, `kh logs hello-lb` streams its access log,
- `kh watch` heals it, Docker's restart policy revives it,
- `kh delete hello-lb` un-exposes, and `expose` again reconciles idempotently
  (changing the port = spec change = rolling replacement).

No config files on disk either: the container's command writes its own nginx config at startup,
so the whole balancer is — like every kh app — fully described by its labels.

## Design decision: per-request DNS, not pinned upstreams

The nginx config proxies through a **variable** with Docker's embedded DNS as resolver:

```nginx
resolver 127.0.0.11 valid=1s ipv6=off;
set $kh_upstream http://hello:80;
proxy_pass $kh_upstream;
```

A variable `proxy_pass` forces nginx to re-resolve per request (a plain `proxy_pass http://hello`
resolves once at startup and pins that IP forever). Resolving the commit-9 app alias each time
means:

- **Scaling needs no reconfiguration** — new replicas join the alias, gone replicas leave it.
- **Rolling updates don't break it** — replaced replicas get new IPs; the proxy never knew the
  old ones.
- Balancing quality is "DNS round-robin": Docker rotates the A-records, so distribution is
  statistical, not strictly even — the honest trade-off for zero-config resilience. (A strict
  upstream list of `kh-<app>-<i>` names would balance perfectly but pins IPs resolved at
  startup — the first rolling update would quietly break it. Wrong default for an orchestrator.)

## Verification (live daemon)

- Two `hello` replicas serving their hostnames: 12 requests through `localhost:18100` split
  **6 / 6**.
- `kh scale hello 3`, no touch of the proxy: 15 requests split **5 / 4 / 6** across three
  hostnames — the new replica entered rotation by itself.
- `kh status` shows `hello-lb 1/1` with `18100->80/tcp`, an ordinary app among apps.

## Phase 2 complete

Networking & discovery (9), volumes (10), health probes (11), the desired-state record (12),
self-healing (13), rolling updates (14) and load balancing (15). Next, Phase 3: single-file
packaging and the local web dashboard.
