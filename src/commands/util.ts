import type Docker from "dockerode";
import { createDockerClient, daemonStartHint } from "../docker/client.js";
import type { ApplyResult } from "../engine/apply.js";
import { fail } from "../ui.js";

/**
 * Connect to the Docker daemon or print a friendly failure and set exit code 1.
 * Commands should return immediately when this yields undefined.
 */
export async function connectOrExit(): Promise<Docker | undefined> {
  const docker = createDockerClient();
  try {
    await docker.ping();
    return docker;
  } catch {
    fail("Docker daemon is not reachable.");
    console.log(`  ${daemonStartHint()}`);
    console.log("  Run `kh doctor` for details.");
    process.exitCode = 1;
    return undefined;
  }
}

/** Print any error as a clean one-liner and set exit code 1. */
export function reportError(err: unknown): void {
  fail(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}

/** "2 created, 1 removed" summary of an ApplyResult, or "nothing to do". */
export function formatApplyActions(r: ApplyResult): string {
  return (
    [
      r.created && `${r.created} created`,
      r.restarted && `${r.restarted} restarted`,
      r.replaced && `${r.replaced} replaced`,
      r.removed && `${r.removed} removed`,
      r.unchanged && `${r.unchanged} unchanged`,
    ]
      .filter(Boolean)
      .join(", ") || "nothing to do"
  );
}
