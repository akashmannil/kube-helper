import type { Command } from "commander";
import { listManaged, type ManagedContainer } from "../engine/state.js";
import { age, dim, green, red, table } from "../ui.js";
import { connectOrExit, reportError } from "./util.js";

/** Unique published ports (Docker lists IPv4 and IPv6 bindings separately). */
function portSummary(containers: ManagedContainer[]): string {
  const seen = new Set<string>();
  for (const c of containers) {
    for (const p of c.ports) {
      if (p.host !== undefined) seen.add(`${p.host}->${p.container}/${p.protocol}`);
    }
  }
  return seen.size > 0 ? [...seen].sort().join(", ") : "-";
}

function readiness(running: number, desired: number): string {
  const text = `${running}/${desired}`;
  return running >= desired && desired > 0 ? green(text) : desired === 0 ? text : red(text);
}

export function registerStatus(program: Command): void {
  program
    .command("status [app]")
    .alias("ps")
    .description("show kh apps on this machine, or the replicas of one app")
    .action(async (app: string | undefined) => {
      const docker = await connectOrExit();
      if (!docker) return;

      try {
        const containers = await listManaged(docker, app);
        if (containers.length === 0) {
          if (app) {
            reportError(new Error(`No app named "${app}". See all apps with: kh status`));
          } else {
            console.log(`No kh apps on this machine. Deploy one with: kh apply -f app.yaml`);
          }
          return;
        }

        if (app) {
          // Detail view: one row per replica.
          const rows = containers.map((c) => [
            c.name,
            c.state === "running" ? green(c.state) : red(c.state),
            c.status,
            portSummary([c]),
          ]);
          console.log(table(["REPLICA", "STATE", "STATUS", "PORTS"], rows));
          return;
        }

        // Overview: one row per app.
        const byApp = new Map<string, ManagedContainer[]>();
        for (const c of containers) {
          byApp.set(c.app, [...(byApp.get(c.app) ?? []), c]);
        }

        const rows = [...byApp.entries()].map(([name, group]) => {
          const running = group.filter((c) => c.state === "running").length;
          // Desired count comes from the spec stored on the containers themselves.
          const desired = group[0]?.spec?.replicas ?? group.length;
          const image = group[0]?.spec?.image ?? group[0]?.image ?? "?";
          const oldest = Math.min(...group.map((c) => c.createdAt));
          return [name, readiness(running, desired), image, portSummary(group), age(oldest)];
        });

        console.log(table(["NAME", "READY", "IMAGE", "PORTS", "AGE"], rows));
        console.log(dim(`\n${byApp.size} app(s), ${containers.length} replica container(s)`));
      } catch (err) {
        reportError(err);
      }
    });
}
