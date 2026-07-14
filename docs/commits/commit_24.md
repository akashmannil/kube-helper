# Commit 24 — Easy / Developer mode toggle

## What this commit delivers

A segmented **Easy / Developer** switch in the header (persisted in `localStorage`) that
reshapes the whole GUI for two audiences:

| | Easy mode (default) | Developer mode |
| --- | --- | --- |
| Wording | "copies", "app package", "reachable in your browser", "keep this app's data" | "replicas", "spec.image", "publish a port", "mount a volume" — real Docker/k8s terms |
| Health badge | "2 of 2 copies running" | "2/2 ready" |
| Replica table | copy / state / details / reachable at | replica / state / status / ports |
| Wizard | name, image, copies, port, settings, keep-data, health toggle | + custom command (argv), port protocol, volume type (managed/bind) + read-only, health probe kind (HTTP/shell) with interval/start-period/retries, restart policy |
| Extras | — | per-app **Manifest** button + **Preview manifest (YAML)** in the wizard, showing the exact `kh/v1` file to `kh apply` from a terminal |

## How it's built

- **Static markup carries both wordings.** Every phrase that differs is a
  `<span class="easy-only">…</span><span class="dev-only">…</span>` pair; advanced fields are
  `class="dev-only"`. Pure CSS (`body[data-mode="dev"] .dev-only { display: revert }` and the
  inverse for `.easy-only`) shows the right set. The only JavaScript is flipping
  `body.dataset.mode` and re-rendering the dynamic app cards (whose wording can't be static).
  No i18n framework, no template duplication in JS.
- **Advanced form values are read only in Developer mode.** In Easy mode the wizard keeps the
  deployed spec's values (when editing) or the schema defaults (when new) for command,
  protocol, volume type, probe tuning and restart policy — so Easy mode *hides* options without
  ever wiping what a Developer-mode or CLI user configured. This is the commit-21 lossless-edit
  principle extended to the mode boundary.
- **The Manifest/Preview view** renders the form's manifest as real YAML (a small serializer in
  the renderer) with the note *"save as app.yaml and run `kh apply -f app.yaml` — the GUI and
  CLI produce identical results."* Developer mode doesn't just relabel; it teaches the CLI
  underneath.
- Everything still flows through the same `applyApp`/zod path — Developer mode adds no engine
  surface, only exposes more of the manifest.

## Verification (live, through the real UI via CDP)

- Default `body[data-mode]` = **easy**; badge read "2 of 2 copies running", table header
  "copy | state | details | reachable at".
- Clicking **Developer** → mode `dev`, badge "2/2 ready", header "replica | state | status |
  ports", the per-app **Manifest** button became visible, `localStorage['kh-mode']` = `dev`.
- **Persistence:** set dev, closed the window gracefully, relaunched → mode restored to `dev`.
- **Advanced deploy:** filled the Developer-only fields (custom command `nginx -g "daemon
  off;"`, `restart: on-failure`, shell health probe), previewed the YAML (command correctly
  parsed to `["nginx","-g","daemon off;"]`), deployed, and inspected the container:
  `restart=on-failure`, `Healthcheck.Test=["CMD-SHELL","wget -qO- http://127.0.0.1/ || exit
  1"]`, `Cmd=["nginx","-g","daemon off;"]`. The form's advanced fields drive real Docker config.

## Result

The desktop app now serves both audiences from one screen: a newcomer never sees the word
"container", while a developer gets full manifest control and a copy-paste path to the CLI —
the "remove the learn-Docker barrier" goal, without capping what power users can do.
