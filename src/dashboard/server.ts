import type Docker from "dockerode";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { AppNotFoundError, deleteApp, scaleApp } from "../engine/actions.js";
import { appsOverview, engineOverview } from "../engine/view.js";
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
        return json(200, await appsOverview(docker));
      }
      if (req.method === "GET" && url.pathname === "/api/info") {
        return json(200, await engineOverview(docker));
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
