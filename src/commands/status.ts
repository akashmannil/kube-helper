import type { Command } from "commander";
import { listApps, type ManagedContainer } from "../engine/state.js";
import { age, dim, green, red, table, yellow } from "../ui.js";
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
        const apps = await listApps(docker, app);
        if (apps.length === 0) {
          if (app) {
            reportError(new Error(`No app named "${app}". See all apps with: kh status`));
          } else {
            console.log(`No kh apps on this machine. Deploy one with: kh apply -f app.yaml`);
          }
          return;
        }

        if (app) {
          // Detail view: one row per replica.
          const replicas = apps[0]?.replicas ?? [];
          if (replicas.length === 0) {
            console.log(`${app} is scaled to 0 replicas. Resize with: kh scale ${app} <n>`);
            return;
          }
          const rows = replicas.map((c) => [
            c.name,
            c.ready ? green(c.state) : c.state === "running" ? yellow(c.state) : red(c.state),
            c.status,
            portSummary([c]),
          ]);
          console.log(table(["REPLICA", "STATE", "STATUS", "PORTS"], rows));
          return;
        }

        // Overview: one row per app.
        const rows = apps.map((state) => {
          // Ready = running and healthy (when a healthcheck exists), like k8s.
          const running = state.replicas.filter((c) => c.ready).length;
          const desired = state.spec?.replicas ?? state.replicas.length;
          const image = state.spec?.image ?? state.replicas[0]?.image ?? "?";
          const members = [...state.replicas, ...(state.meta ? [state.meta] : [])];
          const oldest = Math.min(...members.map((c) => c.createdAt));
          return [
            state.app,
            readiness(running, desired),
            image,
            portSummary(state.replicas),
            age(oldest),
          ];
        });

        const replicaCount = apps.reduce((sum, s) => sum + s.replicas.length, 0);
        console.log(table(["NAME", "READY", "IMAGE", "PORTS", "AGE"], rows));
        console.log(dim(`\n${apps.length} app(s), ${replicaCount} replica container(s)`));
      } catch (err) {
        reportError(err);
      }
    });
}
