# Commit 16 — Single-file executable: `kh.exe`, no Node required

## What this commit delivers

`npm run package` produces `dist-bin/kh.exe` (or `kh` on Linux/macOS): one 88 MB file
containing the entire tool *and* the Node runtime. Copy it to any machine that runs Docker and
the plug-and-play promise from the README is literal — no Node, no npm, no `node_modules`.

## How it works (`scripts/package.mjs`)

1. **esbuild** bundles `src/cli.ts` — TypeScript and all dependencies — into one CommonJS file
   (esbuild compiles TS directly; `tsc` remains the type-checker, esbuild the packager).
2. **Node SEA** (`node --experimental-sea-config`) turns the bundle into a Single Executable
   Application blob.
3. The running Node binary is copied and the blob injected with **postject** at Node's
   documented fuse.

## Decisions & trade-offs

- **SEA over `pkg`/Bun/Deno**: `vercel/pkg` is archived, and Bun/Deno would change the runtime
  the whole tool was verified against. SEA is the platform-blessed path and uses the exact
  Node.js already tested by commits 1–15.
- **`ssh2` native bindings excluded** (`external: ["cpu-features", "*.node"]`): dockerode's
  transitive ssh2 dependency optionally loads native crypto inside try/catch; kh never speaks
  `ssh://`, so the pure-JS fallbacks are fine and the bundle stays portable.
- **Version via static JSON import.** `createRequire(import.meta.url)` reads `package.json`
  at runtime — a file that doesn't exist next to a single-file exe. A static
  `import pkg from "../package.json" with { type: "json" }` lets esbuild inline it at build
  time while remaining a perfectly normal import for the unbundled `dist/` build.
- **The size is the deal.** 88 MB is Node itself. For a portfolio orchestrator the two honest
  install stories are: tiny (`npm i -g`, needs Node) or self-contained (this). Both are in the
  README; neither is pretended to be free.
- **Expected warning:** postject prints `The signature seems corrupted!` — injecting
  invalidates Microsoft's Authenticode signature on the copied `node.exe`. Harmless locally;
  production distribution would re-sign.

## Verification

`dist-bin\kh.exe` ran the complete lifecycle against the live daemon with `dist/` and
`node_modules/` untouched: `--version` → `0.1.0`, `doctor` → all green, `apply` (2-replica
app, created the kh network), `status` → `2/2`, `delete --all` → clean, network removed.

## Next commit

Commit 17: `kh dashboard` — a local read-only web UI over the same engine, still zero new
runtime dependencies (`node:http`).
