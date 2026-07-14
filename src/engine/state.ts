import type Docker from "dockerode";
import { APP_LABEL, MANAGED_LABEL, REPLICA_LABEL, SPEC_HASH_LABEL, SPEC_LABEL } from "../labels.js";
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
  replica: number;
  specHash: string;
  /** Full spec as deployed, parsed back from the kh.spec label (if intact). */
  spec?: AppSpec;
  image: string;
  /** Docker lifecycle state: running | exited | created | restarting | paused | dead */
  state: string;
  /** Human status line, e.g. "Up 5 minutes" */
  status: string;
  ports: PublishedPort[];
  createdAt: number;
}

/** List kh-managed containers (all states), optionally restricted to one app. */
export async function listManaged(docker: Docker, app?: string): Promise<ManagedContainer[]> {
  const labelFilters = [`${MANAGED_LABEL}=true`];
  if (app) labelFilters.push(`${APP_LABEL}=${app}`);

  const containers = await docker.listContainers({ all: true, filters: { label: labelFilters } });

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
    return {
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
      app: c.Labels[APP_LABEL] ?? "",
      replica: Number(c.Labels[REPLICA_LABEL] ?? -1),
      specHash: c.Labels[SPEC_HASH_LABEL] ?? "",
      spec,
      image: c.Image,
      state: c.State,
      status: c.Status,
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
