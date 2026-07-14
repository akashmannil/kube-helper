import type Docker from "dockerode";
import type { AppManifest } from "../manifest/schema.js";
import { applyApp, type ApplyResult } from "./apply.js";
import { listApps, listManaged } from "./state.js";

/** Raised for operations on app names that don't exist — callers map it to 404 / exit 1. */
export class AppNotFoundError extends Error {}

/**
 * Scale an app from its recorded spec. Shared by `kh scale` and the
 * dashboard API so both paths behave identically.
 */
export async function scaleApp(docker: Docker, app: string, replicas: number): Promise<ApplyResult> {
  const [state] = await listApps(docker, app);
  if (!state) {
    throw new AppNotFoundError(`No app named "${app}". See all apps with: kh status`);
  }
  if (!state.spec) {
    throw new Error(`"${app}" carries no readable kh.spec label — re-deploy with: kh apply -f <manifest>`);
  }
  const manifest: AppManifest = {
    apiVersion: "kh/v1",
    kind: "App",
    metadata: { name: app },
    spec: { ...state.spec, replicas },
  };
  return applyApp(docker, manifest);
}

/**
 * nginx config for `exposeApp`. proxy_pass through a *variable* with a
 * resolver forces per-request DNS resolution against Docker's embedded DNS
 * (127.0.0.11), which returns the app-alias IPs in rotating order — the proxy
 * survives scaling and rolling updates with no config regeneration because it
 * never pins replica IPs.
 */
function lbNginxConfig(app: string, targetPort: number): string {
  return (
    `server { listen 80; resolver 127.0.0.11 valid=1s ipv6=off; ` +
    `set $kh_upstream http://${app}:${targetPort}; ` +
    `location / { proxy_pass $kh_upstream; proxy_set_header Host $host; ` +
    `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; } }`
  );
}

/**
 * Put a load-balancing proxy (an ordinary kh app named `<app>-lb`) in front
 * of an app's replicas on one stable host port. Shared by `kh expose` and the
 * desktop app. Returns the proxy app's name and the balanced target port.
 */
export async function exposeApp(
  docker: Docker,
  app: string,
  hostPort: number,
  targetPort?: number
): Promise<{ lbName: string; targetPort: number }> {
  const [state] = await listApps(docker, app);
  if (!state?.spec) {
    throw new AppNotFoundError(`No app named "${app}". See all apps with: kh status`);
  }
  const port = targetPort ?? state.spec.ports[0]?.container ?? 80;
  const lbName = `${app}-lb`;
  const conf = lbNginxConfig(app, port);
  const manifest: AppManifest = {
    apiVersion: "kh/v1",
    kind: "App",
    metadata: { name: lbName },
    spec: {
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
    },
  };
  await applyApp(docker, manifest);
  return { lbName, targetPort: port };
}

/**
 * Remove an app's replicas and meta record (managed volumes are always kept;
 * destroying data stays a deliberate CLI act: `kh delete <app> --volumes`).
 * Returns the number of replica containers removed.
 */
export async function deleteApp(docker: Docker, app: string): Promise<number> {
  const containers = await listManaged(docker, app, { includeMeta: true });
  if (containers.length === 0) {
    throw new AppNotFoundError(`No app named "${app}". See all apps with: kh status`);
  }
  await Promise.all(containers.map((c) => docker.getContainer(c.id).remove({ force: true })));
  return containers.filter((c) => c.role === "replica").length;
}
