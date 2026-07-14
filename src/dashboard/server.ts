import type Docker from "dockerode";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { AppNotFoundError, deleteApp, scaleApp } from "../engine/actions.js";
import { listApps, type ManagedContainer } from "../engine/state.js";
import { dashboardHtml } from "./html.js";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("request body is not valid JSON");
  }
}

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

const SCALE_ROUTE = /^\/api\/apps\/([a-z0-9-]+)\/scale$/;
const APP_ROUTE = /^\/api\/apps\/([a-z0-9-]+)$/;

/** The dashboard HTTP server: static page + JSON API over the kh engine. */
export function createDashboardServer(docker: Docker): Server {
  return createServer((req, res) => {
    const json = (status: number, body: unknown): void => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    const respond = async (): Promise<void> => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(dashboardHtml());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/apps") {
        return json(200, await appsPayload(docker));
      }
      if (req.method === "GET" && url.pathname === "/api/info") {
        return json(200, await infoPayload(docker));
      }

      const scaleMatch = req.method === "POST" && url.pathname.match(SCALE_ROUTE);
      if (scaleMatch) {
        const body = (await readJsonBody(req)) as { replicas?: unknown };
        const replicas = Number(body.replicas);
        if (!Number.isInteger(replicas) || replicas < 0 || replicas > 100) {
          return json(400, { error: "replicas must be an integer between 0 and 100" });
        }
        const result = await scaleApp(docker, scaleMatch[1] ?? "", replicas);
        return json(200, { ok: true, result });
      }

      const deleteMatch = req.method === "DELETE" && url.pathname.match(APP_ROUTE);
      if (deleteMatch) {
        const removed = await deleteApp(docker, deleteMatch[1] ?? "");
        return json(200, { ok: true, removed });
      }

      json(404, { error: "not found" });
    };

    respond().catch((err: unknown) => {
      const status = err instanceof AppNotFoundError ? 404 : 500;
      json(status, { error: err instanceof Error ? err.message : String(err) });
    });
  });
}
