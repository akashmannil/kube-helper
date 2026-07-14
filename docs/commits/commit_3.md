# Commit 3 — Declarative app manifest (`khapp.yaml`) & `kh validate`

## What this commit delivers

- The **app manifest**: one small YAML file that fully describes an app (`examples/nginx.yaml`).
- `src/manifest/schema.ts` — zod schema, the single source of truth for what an app *is*.
- `src/manifest/load.ts` — loads a file, supports multiple apps per file separated by `---`
  (kubectl-style), and converts every problem into a clean human error.
- `kh validate [-f path]` — checks a manifest without touching Docker.

## The manifest format

```yaml
apiVersion: kh/v1
kind: App
metadata:
  name: web              # DNS-label rule, same as Kubernetes object names
spec:
  image: nginx:alpine
  replicas: 2            # default 1
  command: ["nginx", "-g", "daemon off;"]   # optional override
  env:
    NGINX_ENTRYPOINT_QUIET_LOGS: 1          # numbers/bools coerced to strings
  ports:
    - container: 80
      host: 8080         # optional; auto-increments per replica (8080, 8081, ...)
      protocol: tcp      # default tcp
  restart: always        # no | always | on-failure | unless-stopped (default always)
```

`apiVersion`/`kind`/`metadata`/`spec` deliberately mirror Kubernetes: anyone who has seen a k8s
Deployment reads this instantly, and the envelope leaves room for future kinds (e.g. `Volume`,
`Stack`) without breaking `kh/v1` files.

## Design decisions

- **Strict schemas (`z.strictObject`)** — unknown keys are hard errors. A typo like `imag:`
  fails validation loudly instead of deploying an image-less app. This is the single biggest
  YAML-usability lesson from Kubernetes, where typoed optional fields silently do nothing.
- **Defaults live in the schema** — `replicas: 1`, `restart: always`, `protocol: tcp` are
  applied at parse time, so the rest of the codebase always works with a fully-populated
  `AppSpec` and never re-implements defaulting.
- **Env value coercion** — YAML authors write `DEBUG: 1` or `FLAG: true` naturally; the schema
  accepts string/number/boolean and coerces to string (what Docker expects) instead of failing
  pedantically.
- **All errors are `ManifestError`** — commands print them as one clean message and exit 1.
  Stack traces are reserved for actual bugs.
- **Replica count 0 is allowed** — "scale to zero but keep the definition" is a legitimate
  desired state the reconciler (commit 4) can enforce.

## Verification

```
$ kh validate -f examples/nginx.yaml
√ web image=nginx:alpine replicas=2 ports=8080->80/tcp
√ examples/nginx.yaml: 1 valid app manifest(s)

$ kh validate -f broken.yaml        # bad name, `imag` typo, replicas: two
× Invalid app manifest in "broken.yaml":
  metadata.name: must be a DNS-style label: lowercase letters, digits and dashes
  spec.image: Invalid input: expected string, received undefined
  spec.replicas: Invalid input: expected number, received string
  spec: Unrecognized key: "imag"
(exit 1)

$ kh validate                       # no khapp.yaml in cwd
× Cannot read manifest file "khapp.yaml". Pass one with -f <path> or create khapp.yaml.
(exit 1)
```

## Next commit

Commit 4 is the core of the tool: `kh apply` — take a manifest, pull the image if needed, and
reconcile running containers to the desired state (create missing replicas, replace changed
ones, remove excess ones).
