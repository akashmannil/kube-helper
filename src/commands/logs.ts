import type { Command } from "commander";
import { styleText } from "node:util";
import { createLogDemuxer } from "../engine/logstream.js";
import { listManaged, type ManagedContainer } from "../engine/state.js";
import { red } from "../ui.js";
import { connectOrExit, reportError } from "./util.js";

const PREFIX_COLORS = ["cyan", "magenta", "yellow", "green", "blue", "white"] as const;

function prefixFor(c: ManagedContainer): string {
  const color = PREFIX_COLORS[c.replica % PREFIX_COLORS.length] ?? "white";
  return styleText(color, `[${c.name}]`);
}

interface LogsOptions {
  follow?: boolean;
  tail?: string;
  timestamps?: boolean;
}

export function registerLogs(program: Command): void {
  program
    .command("logs <app>")
    .description("show logs from all replicas of an app, each line prefixed with its replica")
    .option("-f, --follow", "stream new log lines as they arrive (Ctrl+C to stop)")
    .option("-n, --tail <lines>", "only show the last N lines per replica")
    .option("-t, --timestamps", "prefix each line with its timestamp")
    .action(async (app: string, options: LogsOptions) => {
      const docker = await connectOrExit();
      if (!docker) return;

      let containers;
      try {
        containers = await listManaged(docker, app);
      } catch (err) {
        return reportError(err);
      }
      if (containers.length === 0) {
        return reportError(new Error(`No app named "${app}". See all apps with: kh status`));
      }

      let tail: number | undefined; // undefined = Docker's default, "all"
      if (options.tail !== undefined) {
        tail = Number(options.tail);
        if (!Number.isInteger(tail) || tail < 0) {
          return reportError(new Error(`--tail expects a non-negative integer, got "${options.tail}".`));
        }
      }
      const common: { stdout: true; stderr: true; timestamps: boolean; tail?: number } = {
        stdout: true,
        stderr: true,
        timestamps: options.timestamps ?? false,
      };
      if (tail !== undefined) common.tail = tail;

      if (!options.follow) {
        // Snapshot: one replica after another, in index order.
        for (const c of containers) {
          const prefix = prefixFor(c);
          const demux = createLogDemuxer((line, source) => {
            console.log(`${prefix} ${source === "stderr" ? red(line) : line}`);
          });
          const buf = await docker.getContainer(c.id).logs({ ...common, follow: false });
          demux.feed(buf);
          demux.end();
        }
        return;
      }

      // Follow: all replicas stream live, interleaved as lines arrive.
      await Promise.all(
        containers.map(async (c) => {
          const prefix = prefixFor(c);
          const demux = createLogDemuxer((line, source) => {
            console.log(`${prefix} ${source === "stderr" ? red(line) : line}`);
          });
          const stream = await docker.getContainer(c.id).logs({ ...common, follow: true });
          await new Promise<void>((resolve, reject) => {
            stream.on("data", (chunk: Buffer) => demux.feed(chunk));
            stream.on("end", () => {
              demux.end();
              resolve();
            });
            stream.on("error", reject);
          });
        })
      ).catch(reportError);
    });
}
