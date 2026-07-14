import type { Command } from "commander";
import { applyApp } from "../engine/apply.js";
import { listManaged } from "../engine/state.js";
import { DEFAULT_MANIFEST, loadManifests, ManifestError } from "../manifest/load.js";
import { bold, dim, info, ok } from "../ui.js";
import { connectOrExit, formatApplyActions, reportError } from "./util.js";

export function registerApply(program: Command): void {
  program
    .command("apply")
    .description("create or update apps to match a manifest (declarative deploy, rolling)")
    .option("-f, --file <path>", "manifest file to apply", DEFAULT_MANIFEST)
    .option("--timeout <seconds>", "per-replica readiness timeout during rolling updates", "60")
    .action(async (options: { file: string; timeout: string }) => {
      const timeout = Number(options.timeout);
      if (!Number.isFinite(timeout) || timeout < 1) {
        return reportError(new Error(`--timeout expects seconds ≥ 1, got "${options.timeout}".`));
      }
      let apps;
      try {
        apps = await loadManifests(options.file);
      } catch (err) {
        if (err instanceof ManifestError) return reportError(err);
        throw err;
      }

      const docker = await connectOrExit();
      if (!docker) return;

      for (const manifest of apps) {
        const name = manifest.metadata.name;
        try {
          const r = await applyApp(docker, manifest, (msg) => info(msg), {
            readyTimeoutMs: timeout * 1000,
          });
          const running = (await listManaged(docker, name)).filter(
            (c) => c.state === "running"
          ).length;
          ok(
            `${bold(name)} reconciled: ${formatApplyActions(r)} ` +
              dim(`(${running}/${manifest.spec.replicas} replicas running)`)
          );
        } catch (err) {
          reportError(new Error(`Failed to apply "${name}": ${err instanceof Error ? err.message : String(err)}`));
          return;
        }
      }
    });
}
