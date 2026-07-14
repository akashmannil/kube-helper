import type { Command } from "commander";
import { setTimeout as sleep } from "node:timers/promises";
import { reconcilePass } from "../engine/reconcile.js";
import { bold, dim, info, warn } from "../ui.js";
import { connectOrExit, formatApplyActions, reportError } from "./util.js";

function stamp(): string {
  return dim(`[${new Date().toISOString().slice(11, 19)}]`);
}

export function registerWatch(program: Command): void {
  program
    .command("watch")
    .description("run the reconciler: keep every kh app at its desired state (self-healing)")
    .option("-i, --interval <seconds>", "seconds between reconcile passes", "10")
    .option("--unhealthy-backoff <seconds>", "minimum seconds between restarts of one unhealthy replica", "60")
    .option("--once", "run a single reconcile pass and exit")
    .action(async (options: { interval: string; unhealthyBackoff: string; once?: boolean }) => {
      const interval = Number(options.interval);
      const backoff = Number(options.unhealthyBackoff);
      if (!Number.isFinite(interval) || interval < 1) {
        return reportError(new Error(`--interval expects a number of seconds ≥ 1, got "${options.interval}".`));
      }
      if (!Number.isFinite(backoff) || backoff < 0) {
        return reportError(new Error(`--unhealthy-backoff expects seconds ≥ 0, got "${options.unhealthyBackoff}".`));
      }

      const docker = await connectOrExit();
      if (!docker) return;

      const lastUnhealthyRestart = new Map<string, number>();
      if (!options.once) {
        info(`Reconciling every ${interval}s — Ctrl+C to stop. Quiet means healthy.`);
      }

      for (;;) {
        try {
          const reports = await reconcilePass(docker, lastUnhealthyRestart, backoff * 1000);
          for (const r of reports) {
            const parts: string[] = [];
            if (r.result.created + r.result.restarted + r.result.replaced + r.result.removed > 0) {
              parts.push(formatApplyActions(r.result));
            }
            if (r.restartedUnhealthy.length > 0) {
              parts.push(`restarted unhealthy: ${r.restartedUnhealthy.join(", ")}`);
            }
            console.log(`${stamp()} ${bold(r.app)}: ${parts.join("; ")}`);
          }
        } catch (err) {
          // The daemon may vanish mid-run (Docker Desktop restart); keep trying.
          warn(`reconcile pass failed: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (options.once) return;
        await sleep(interval * 1000);
      }
    });
}
