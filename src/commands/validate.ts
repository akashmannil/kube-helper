import type { Command } from "commander";
import { DEFAULT_MANIFEST, loadManifests, ManifestError } from "../manifest/load.js";
import { bold, dim, fail, ok } from "../ui.js";

export function registerValidate(program: Command): void {
  program
    .command("validate")
    .description("validate an app manifest without touching Docker")
    .option("-f, --file <path>", "manifest file to validate", DEFAULT_MANIFEST)
    .action(async (options: { file: string }) => {
      let apps;
      try {
        apps = await loadManifests(options.file);
      } catch (err) {
        if (err instanceof ManifestError) {
          fail(err.message);
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      for (const app of apps) {
        const { name } = app.metadata;
        const { image, replicas, ports } = app.spec;
        const portInfo =
          ports.length > 0
            ? ports.map((p) => `${p.host ?? "auto"}->${p.container}/${p.protocol}`).join(", ")
            : "none";
        ok(`${bold(name)} ${dim(`image=${image} replicas=${replicas} ports=${portInfo}`)}`);
      }
      ok(`${options.file}: ${apps.length} valid app manifest(s)`);
    });
}
