import type { Command } from "commander";
import { exposeApp } from "../engine/actions.js";
import { bold, dim, ok } from "../ui.js";
import { connectOrExit, reportError } from "./util.js";

export function registerExpose(program: Command): void {
  program
    .command("expose <app> <hostPort>")
    .description("run a load-balancing proxy for an app's replicas on one stable host port")
    .option("--target-port <port>", "app container port to balance to (default: first port in the app's spec, else 80)")
    .action(async (app: string, hostPortArg: string, options: { targetPort?: string }) => {
      const hostPort = Number(hostPortArg);
      if (!Number.isInteger(hostPort) || hostPort < 1 || hostPort > 65535) {
        return reportError(new Error(`Host port must be an integer between 1 and 65535, got "${hostPortArg}".`));
      }
      let targetPort: number | undefined;
      if (options.targetPort !== undefined) {
        targetPort = Number(options.targetPort);
        if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
          return reportError(new Error(`--target-port must be an integer between 1 and 65535.`));
        }
      }

      const docker = await connectOrExit();
      if (!docker) return;

      try {
        const { lbName, targetPort: balanced } = await exposeApp(docker, app, hostPort, targetPort);
        ok(
          `${bold(app)} exposed on http://localhost:${hostPort} ` +
            dim(`(proxy app "${lbName}" balancing to ${app}:${balanced})`)
        );
        console.log(dim(`  The proxy is a normal kh app: kh status ${lbName} · kh delete ${lbName}`));
      } catch (err) {
        reportError(err);
      }
    });
}
