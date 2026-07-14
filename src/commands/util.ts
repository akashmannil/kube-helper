import type Docker from "dockerode";
import { createDockerClient, daemonStartHint } from "../docker/client.js";
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
