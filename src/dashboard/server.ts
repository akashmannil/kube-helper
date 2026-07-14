import type Docker from "dockerode";
import { createServer, type Server } from "node:http";
import { listApps, type ManagedContainer } from "../engine/state.js";
import { dashboardHtml } from "./html.js";

function publishedPorts(containers: ManagedContainer[]): string[] {
  const seen = new Set<string>();
  for (const c of containers) {
    for (const p of c.ports) {
      if (p.host !== undefined) seen.add(`${p.host}->${p.container}/${p.protocol}`);
    }
  }
  return [...seen].sort();
}

async function appsPayload(docker: Docker): Promise<unknown> {
  const apps = await listApps(docker);
  return {
    apps: apps.map((state) => ({
      name: state.app,
      image: state.spec?.image ?? state.replicas[0]?.image ?? "?",
      desired: state.spec?.replicas ?? state.replicas.length,
      ready: state.replicas.filter((c) => c.ready).length,
      ports: publishedPorts(state.replicas),
      replicas: state.replicas.map((c) => ({
        name: c.name,
        replica: c.replica,
        state: c.state,
        health: c.health ?? null,
        ready: c.ready,
        status: c.status,
        ports: publishedPorts([c]),
      })),
    })),
  };
}

async function infoPayload(docker: Docker): Promise<unknown> {
  const [version, info] = await Promise.all([docker.version(), docker.info()]);
  return {
    engine: version.Version,
    api: version.ApiVersion,
    os: version.Os,
    arch: version.Arch,
    containersRunning: info.ContainersRunning,
    containers: info.Containers,
    images: info.Images,
  };
}

/** The dashboard HTTP server: static page + JSON API over the kh engine. */
export function createDashboardServer(docker: Docker): Server {
  return createServer((req, res) => {
    const respond = async (): Promise<void> => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(dashboardHtml());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/apps") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(await appsPayload(docker)));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/info") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(await infoPayload(docker)));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    };

    respond().catch((err: unknown) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
  });
}
