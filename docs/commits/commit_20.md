# Commit 20 — The "New app" wizard: deploy from a form, no YAML, no jargon

## What this commit delivers

Two buttons in the desktop app's header:

- **＋ New app** — a form that *is* the manifest, with a plain-language explanation under every
  field (see below). Submitting runs the same `applyApp` reconciler as `kh apply`.
- **Run sample app** — one click deploys a 2-copy demo web server on the first free port
  (auto-scanned 8090-8199), so a first-time user sees success in seconds instead of reading
  docs. Docker's biggest onboarding cliff — "what do I even type?" — is gone.

## How the form teaches without teaching

Every Docker/Kubernetes concept is renamed to what it *does*, and explained where it's used:

| Docker/k8s concept | The form says |
| --- | --- |
| image | "App package — think of it as the app's installer; downloaded automatically. Pick a suggestion or paste any image name a developer gave you." (+ a datalist: nginx, Apache, PostgreSQL, MySQL, Redis, Ghost — each with a one-line description) |
| replicas | "Copies — with 2 or more, the app stays up even if one copy crashes, and updates happen with no downtime." |
| ports / bindings | "Reachable in your browser" checkbox → "Port on this computer (you'll open localhost:<port>)" and "Port inside the app (web servers are usually 80)." |
| env vars | "Settings — passed to the app, e.g. a database needs POSTGRES_PASSWORD." (key/value rows) |
| volumes | "Keep this app's data — files saved there survive updates, restarts and crashes," with pre-filled paths for PostgreSQL/MySQL in the hint. |
| healthcheck | "Auto health check — copies that stop answering are marked unhealthy and restarted by the watcher." |

The deploy button itself sets expectations: *"Deploying… (first time may download the app)"*.

## Design decisions

- **The form builds a manifest object; the main process re-validates it with the same zod
  schema as `kh validate`.** The renderer is untrusted UI — validation errors come back as the
  familiar field-by-field messages ("metadata.name: must be a DNS-style label…") and appear
  inline in the dialog. One schema remains the single definition of an app.
- **The sample app picks its own port** by scanning for a free one in the main process
  (net.listen probe), because "port already in use" is exactly the kind of error a newcomer
  can't act on.
- **Nothing GUI-only exists in the engine.** A user who outgrows the form can `kh status` the
  same apps from a terminal — the GUI writes no state of its own.

## Verification (live, through the real UI path)

Drove the actual DOM over the Chrome DevTools Protocol: clicked **＋ New app**, typed values
into the form fields (name `gui-app`, image `nginx:alpine`, 2 copies, port 18200, health check
on), clicked **Deploy**, and 6 s later `window.kh.listApps()` reported
`gui-app 2/2 18200->80/tcp,18201->80/tcp`. Then clicked **Run sample app** →
`my-first-app 2/2 8090->80/tcp,8091->80/tcp` (port auto-picked). Cross-checked outside the GUI:
`kh status` shows the same three apps, and `localhost:18200` answered HTTP 200 — with the
health probe green, so readiness is real, not cosmetic.

## Next commit

Commit 21 makes every day-2 operation clickable: scale, logs, edit (rolling update), delete,
and "share on a port" (expose).
