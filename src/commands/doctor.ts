import type { Command } from "commander";
import { connectionTarget, createDockerClient, daemonStartHint } from "../docker/client.js";
import { dim, fail, info, ok } from "../ui.js";
import { MANAGED_LABEL } from "../labels.js";

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("check that this machine is ready to run kh apps")
    .action(async () => {
      info(`Docker endpoint: ${connectionTarget()}`);

      const docker = createDockerClient({ timeoutMs: 5_000 });
      try {
        await docker.ping();
      } catch (err) {
        fail("Docker daemon is not reachable.");
        console.log(`  ${dim(err instanceof Error ? err.message : String(err))}`);
        console.log(`  ${daemonStartHint()}`);
        process.exitCode = 1;
        return;
      }
      ok("Docker daemon is reachable");

      const [version, engineInfo, managed] = await Promise.all([
        docker.version(),
        docker.info(),
        docker.listContainers({ all: true, filters: { label: [`${MANAGED_LABEL}=true`] } }),
      ]);

      ok(`Engine ${version.Version} (API ${version.ApiVersion}) on ${version.Os}/${version.Arch}`);
      ok(
        `${engineInfo.ContainersRunning}/${engineInfo.Containers} containers running, ` +
          `${engineInfo.Images} images present`
      );
      info(`${managed.length} kh-managed container(s) on this machine`);
      ok("Ready to run kh apps");
    });
}
