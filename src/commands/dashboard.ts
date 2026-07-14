import type { Command } from "commander";
import { createDashboardServer } from "../dashboard/server.js";
import { dim, ok } from "../ui.js";
import { connectOrExit, reportError } from "./util.js";

export function registerDashboard(program: Command): void {
  program
    .command("dashboard")
    .description("serve a local web dashboard of all kh apps")
    .option("-p, --port <port>", "port to listen on", "8787")
    .option("--host <host>", "address to bind (keep it local unless you know why)", "127.0.0.1")
    .action(async (options: { port: string; host: string }) => {
      const port = Number(options.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return reportError(new Error(`--port must be an integer between 1 and 65535, got "${options.port}".`));
      }

      const docker = await connectOrExit();
      if (!docker) return;

      const server = createDashboardServer(docker);
      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          reportError(new Error(`Port ${port} is already in use — pick another with --port.`));
        } else {
          reportError(err);
        }
      });
      server.listen(port, options.host, () => {
        ok(`Dashboard on http://${options.host}:${port} ${dim("(Ctrl+C to stop)")}`);
      });
    });
}
