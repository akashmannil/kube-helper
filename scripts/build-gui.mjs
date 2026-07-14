/**
 * Build the Electron GUI assets into dist/electron/:
 *   - preload.cjs  (sandboxed preload must be CommonJS)
 *   - renderer.js  (browser bundle of the UI)
 *   - index.html   (copied)
 * The Electron main process itself is compiled by plain `tsc` alongside the
 * CLI; renderer/preload are type-checked separately via tsconfig.gui.json.
 */
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "electron");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, "src", "electron", "preload.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  outfile: join(out, "preload.cjs"),
});

await build({
  entryPoints: [join(root, "src", "electron", "renderer", "renderer.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: join(out, "renderer.js"),
});

copyFileSync(join(root, "src", "electron", "renderer", "index.html"), join(out, "index.html"));
console.log("gui assets built → dist/electron/");
