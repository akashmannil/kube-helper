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
