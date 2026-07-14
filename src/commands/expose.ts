import type { Command } from "commander";
import { applyApp } from "../engine/apply.js";
import { listApps } from "../engine/state.js";
import type { AppManifest, AppSpec } from "../manifest/schema.js";
import { bold, dim, ok } from "../ui.js";
import { connectOrExit, reportError } from "./util.js";

/**
 * nginx config for the balancer. proxy_pass through a *variable* with a
 * resolver forces per-request DNS resolution against Docker's embedded DNS
 * (127.0.0.11), which returns the app-alias IPs in rotating order. That is
 * what makes the proxy survive scaling and rolling updates with no config
 * regeneration: it never pins replica IPs.
 */
function nginxConfig(app: string, targetPort: number): string {
  return (
    `server { listen 80; resolver 127.0.0.11 valid=1s ipv6=off; ` +
    `set $kh_upstream http://${app}:${targetPort}; ` +
    `location / { proxy_pass $kh_upstream; proxy_set_header Host $host; ` +
    `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; } }`
  );
}

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

      const docker = await connectOrExit();
      if (!docker) return;

      try {
        const [state] = await listApps(docker, app);
        if (!state?.spec) {
          return reportError(new Error(`No app named "${app}". See all apps with: kh status`));
        }

        const targetPort =
          options.targetPort !== undefined
            ? Number(options.targetPort)
            : state.spec.ports[0]?.container ?? 80;
        if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
          return reportError(new Error(`--target-port must be an integer between 1 and 65535.`));
        }

        const lbName = `${app}-lb`;
        const conf = nginxConfig(app, targetPort);
        const spec: AppSpec = {
          image: "nginx:alpine",
          replicas: 1,
          command: [
            "sh",
            "-c",
            `printf '%s' '${conf}' > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'`,
          ],
          env: {},
          ports: [{ container: 80, host: hostPort, protocol: "tcp" }],
          volumes: [],
          restart: "always",
        };
        const manifest: AppManifest = {
          apiVersion: "kh/v1",
          kind: "App",
          metadata: { name: lbName },
          spec,
        };

        await applyApp(docker, manifest);
        ok(
          `${bold(app)} exposed on http://localhost:${hostPort} ` +
            dim(`(proxy app "${lbName}" balancing to ${app}:${targetPort})`)
        );
        console.log(dim(`  The proxy is a normal kh app: kh status ${lbName} · kh delete ${lbName}`));
      } catch (err) {
        reportError(err);
      }
    });
}
