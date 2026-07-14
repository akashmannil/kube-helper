import type Docker from "dockerode";
import {
  APP_LABEL,
  MANAGED_LABEL,
  REPLICA_LABEL,
  ROLE_LABEL,
  SPEC_HASH_LABEL,
  SPEC_LABEL,
} from "../labels.js";
import { appManifestSchema, type AppSpec } from "../manifest/schema.js";

export interface PublishedPort {
  container: number;
  host?: number;
  protocol: string;
}

/** A kh-created container, as reconstructed purely from Docker labels. */
export interface ManagedContainer {
  id: string;
  name: string;
  app: string;
  /** "replica" runs the workload; "meta" is the app's desired-state record. */
  role: "replica" | "meta";
  replica: number;
  specHash: string;
  /** Full spec as deployed, parsed back from the kh.spec label (if intact). */
  spec?: AppSpec;
  image: string;
  /** Docker lifecycle state: running | exited | created | restarting | paused | dead */
  state: string;
  /** Human status line, e.g. "Up 5 minutes (healthy)" */
  status: string;
  /** Healthcheck verdict, if the container has one. */
  health?: "healthy" | "unhealthy" | "starting";
  /** running, and healthy if a healthcheck exists — the k8s notion of Ready. */
  ready: boolean;
  ports: PublishedPort[];
  createdAt: number;
}

/**
 * List kh-managed *replica* containers (all states), optionally restricted to
 * one app. Meta containers are excluded unless `includeMeta` is set — most
 * callers (logs, status detail, reconcile loops) only care about workloads.
 */
export async function listManaged(
  docker: Docker,
  app?: string,
  opts: { includeMeta?: boolean } = {}
): Promise<ManagedContainer[]> {
  const labelFilters = [`${MANAGED_LABEL}=true`];
  if (app) labelFilters.push(`${APP_LABEL}=${app}`);

  const raw = await docker.listContainers({ all: true, filters: { label: labelFilters } });
  const containers = opts.includeMeta
    ? raw
    : raw.filter((c) => c.Labels[ROLE_LABEL] !== "meta");

  const managed = containers.map((c): ManagedContainer => {
    let spec: AppSpec | undefined;
    const rawSpec = c.Labels[SPEC_LABEL];
    if (rawSpec) {
      try {
        spec = appManifestSchema.shape.spec.parse(JSON.parse(rawSpec));
      } catch {
        // Label was tampered with or written by a future kh version; treat as unknown.
      }
    }
    // The list endpoint reports health only inside the human status line,
    // e.g. "Up 2 minutes (unhealthy)" — parsing it beats one inspect per container.
    let health: ManagedContainer["health"];
    if (c.Status.includes("(healthy)")) health = "healthy";
    else if (c.Status.includes("(unhealthy)")) health = "unhealthy";
    else if (c.Status.includes("(health: starting)")) health = "starting";

    return {
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
      app: c.Labels[APP_LABEL] ?? "",
      role: c.Labels[ROLE_LABEL] === "meta" ? "meta" : "replica",
      replica: Number(c.Labels[REPLICA_LABEL] ?? -1),
      specHash: c.Labels[SPEC_HASH_LABEL] ?? "",
      spec,
      image: c.Image,
      state: c.State,
      status: c.Status,
      health,
      ready: c.State === "running" && (health === undefined || health === "healthy"),
      // Ports is null (not []) for containers with no exposed ports.
      ports: (c.Ports ?? []).map((p) => ({
        container: p.PrivatePort,
        host: p.PublicPort,
        protocol: p.Type,
      })),
      createdAt: c.Created,
    };
  });

  return managed.sort((a, b) => a.app.localeCompare(b.app) || a.replica - b.replica);
}

/** One kh app: its desired spec (from the meta record) and its replicas. */
export interface AppState {
  app: string;
  /** Desired spec — meta record first, newest replica's label as fallback. */
  spec?: AppSpec;
  replicas: ManagedContainer[];
  meta?: ManagedContainer;
}

/** Group every kh container on the machine into per-app desired+actual state. */
export async function listApps(docker: Docker, app?: string): Promise<AppState[]> {
  const all = await listManaged(docker, app, { includeMeta: true });
  const byApp = new Map<string, AppState>();
  for (const c of all) {
    const state = byApp.get(c.app) ?? { app: c.app, replicas: [] };
    if (c.role === "meta") state.meta = c;
    else state.replicas.push(c);
    byApp.set(c.app, state);
  }
  for (const state of byApp.values()) {
    state.spec =
      state.meta?.spec ??
      [...state.replicas].sort((a, b) => b.createdAt - a.createdAt).find((c) => c.spec)?.spec;
  }
  return [...byApp.values()].sort((a, b) => a.app.localeCompare(b.app));
}
