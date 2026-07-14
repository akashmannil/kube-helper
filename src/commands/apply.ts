import type { Command } from "commander";
import { applyApp } from "../engine/apply.js";
import { listManaged } from "../engine/state.js";
import { DEFAULT_MANIFEST, loadManifests, ManifestError } from "../manifest/load.js";
import { bold, dim, info, ok } from "../ui.js";
import { connectOrExit, reportError } from "./util.js";

export function registerApply(program: Command): void {
  program
    .command("apply")
    .description("create or update apps to match a manifest (declarative deploy)")
    .option("-f, --file <path>", "manifest file to apply", DEFAULT_MANIFEST)
    .action(async (options: { file: string }) => {
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
          const r = await applyApp(docker, manifest, (msg) => info(msg));
          const actions = [
            r.created && `${r.created} created`,
            r.restarted && `${r.restarted} restarted`,
            r.replaced && `${r.replaced} replaced`,
            r.removed && `${r.removed} removed`,
            r.unchanged && `${r.unchanged} unchanged`,
          ]
            .filter(Boolean)
            .join(", ");

          const running = (await listManaged(docker, name)).filter(
            (c) => c.state === "running"
          ).length;
          ok(
            `${bold(name)} reconciled: ${actions || "nothing to do"} ` +
              dim(`(${running}/${manifest.spec.replicas} replicas running)`)
          );
        } catch (err) {
          reportError(new Error(`Failed to apply "${name}": ${err instanceof Error ? err.message : String(err)}`));
          return;
        }
      }
    });
}
