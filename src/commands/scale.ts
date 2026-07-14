import type { Command } from "commander";
import { scaleApp } from "../engine/actions.js";
import { listManaged } from "../engine/state.js";
import { bold, dim, ok } from "../ui.js";
import { connectOrExit, formatApplyActions, reportError } from "./util.js";

export function registerScale(program: Command): void {
  program
    .command("scale <app> <replicas>")
    .description("scale an app up or down — no manifest file needed")
    .action(async (app: string, replicasArg: string) => {
      const replicas = Number(replicasArg);
      if (!Number.isInteger(replicas) || replicas < 0 || replicas > 100) {
        return reportError(new Error(`Replica count must be an integer between 0 and 100, got "${replicasArg}".`));
      }

      const docker = await connectOrExit();
      if (!docker) return;

      try {
        const r = await scaleApp(docker, app, replicas);
        const running = (await listManaged(docker, app)).filter(
          (c) => c.state === "running"
        ).length;
        ok(
          `${bold(app)} scaled to ${replicas}: ${formatApplyActions(r)} ` +
            dim(`(${running}/${replicas} replicas running)`)
        );
        if (replicas === 0) {
          console.log(dim("  The app definition is kept; bring it back with: kh scale " + app + " <n>"));
        }
      } catch (err) {
        reportError(err);
      }
    });
}
