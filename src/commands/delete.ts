import type { Command } from "commander";
import { KH_NETWORK, removeKhNetworkIfIdle } from "../docker/network.js";
import { listManaged, type ManagedContainer } from "../engine/state.js";
import { listManagedVolumes } from "../engine/volumes.js";
import { bold, dim, ok } from "../ui.js";
import { connectOrExit, reportError } from "./util.js";

export function registerDelete(program: Command): void {
  program
    .command("delete [app]")
    .alias("rm")
    .description("remove an app and all its replica containers")
    .option("--all", "remove every kh-managed app on this machine")
    .option("--volumes", "also remove the app's managed volumes (data is lost)")
    .action(async (app: string | undefined, options: { all?: boolean; volumes?: boolean }) => {
      if (!app && !options.all) {
        return reportError(new Error("Name an app to delete, or pass --all for every kh app."));
      }
      if (app && options.all) {
        return reportError(new Error("Pass either an app name or --all, not both."));
      }

      const docker = await connectOrExit();
      if (!docker) return;

      try {
        const containers = await listManaged(docker, app);
        const volumes = await listManagedVolumes(docker, app);
        if (containers.length === 0 && (!options.volumes || volumes.length === 0)) {
          if (app) {
            return reportError(new Error(`No app named "${app}". See all apps with: kh status`));
          }
          console.log("Nothing to delete — no kh apps on this machine.");
          return;
        }

        const byApp = new Map<string, ManagedContainer[]>();
        for (const c of containers) {
          byApp.set(c.app, [...(byApp.get(c.app) ?? []), c]);
        }

        for (const [name, group] of byApp) {
          await Promise.all(
            group.map((c) => docker.getContainer(c.id).remove({ force: true }))
          );
          ok(`${bold(name)} deleted ${dim(`(${group.length} container(s) removed)`)}`);
        }

        if (volumes.length > 0) {
          if (options.volumes) {
            await Promise.all(volumes.map((name) => docker.getVolume(name).remove()));
            ok(`Removed ${volumes.length} managed volume(s): ${dim(volumes.join(", "))}`);
          } else {
            console.log(
              dim(
                `  Kept ${volumes.length} managed volume(s); remove with: kh delete ${app ?? "--all"} --volumes`
              )
            );
          }
        }

        if (options.all && (await removeKhNetworkIfIdle(docker))) {
          console.log(dim(`  Removed the shared "${KH_NETWORK}" network.`));
        }
      } catch (err) {
        reportError(err);
      }
    });
}
