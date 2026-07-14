import type { Command } from "commander";
import { listManaged, type ManagedContainer } from "../engine/state.js";
import { bold, dim, ok } from "../ui.js";
import { connectOrExit, reportError } from "./util.js";

export function registerDelete(program: Command): void {
  program
    .command("delete [app]")
    .alias("rm")
    .description("remove an app and all its replica containers")
    .option("--all", "remove every kh-managed app on this machine")
    .action(async (app: string | undefined, options: { all?: boolean }) => {
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
        if (containers.length === 0) {
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
      } catch (err) {
        reportError(err);
      }
    });
}
