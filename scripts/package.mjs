/**
 * Build kh as a single-file executable using Node's SEA (Single Executable
 * Application) support:
 *
 *   1. esbuild bundles src/cli.ts (TypeScript, all deps) into one CJS file
 *   2. `node --experimental-sea-config` turns it into a SEA blob
 *   3. the current Node binary is copied and the blob injected via postject
 *
 * Output: dist-bin/kh.exe (Windows) or dist-bin/kh — runs with no Node
 * installation on the target machine.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { inject } from "postject";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "build");
const outDir = join(root, "dist-bin");
const bundle = join(buildDir, "kh-bundle.cjs");
const blob = join(buildDir, "kh.blob");
const exe = join(outDir, process.platform === "win32" ? "kh.exe" : "kh");

mkdirSync(buildDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

console.log("1/4 bundling with esbuild …");
await build({
  entryPoints: [join(root, "src", "cli.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: bundle,
  // ssh2 (a dockerode transitive dep, used only for ssh:// hosts kh doesn't
  // offer) optionally requires native bindings inside try/catch blocks;
  // leaving them unresolved keeps the pure-JS fallbacks.
  external: ["cpu-features", "*.node"],
  logLevel: "warning",
});

console.log("2/4 generating SEA blob …");
writeFileSync(
  join(buildDir, "sea-config.json"),
  JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true })
);
execFileSync(process.execPath, ["--experimental-sea-config", join(buildDir, "sea-config.json")], {
  stdio: "inherit",
});

console.log("3/4 copying node runtime …");
copyFileSync(process.execPath, exe);

console.log("4/4 injecting blob (postject) …");
await inject(exe, "NODE_SEA_BLOB", readFileSync(blob), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
});

const mb = (statSync(exe).size / 1024 / 1024).toFixed(1);
console.log(`done: ${exe} (${mb} MB)`);
