import type Docker from "dockerode";
import type { AppManifest } from "../manifest/schema.js";
import { applyApp, type ApplyResult } from "./apply.js";
import { listApps, listManaged } from "./state.js";

export interface ReconcileReport {
  app: string;
  result: ApplyResult;
  restartedUnhealthy: string[];
}

function hasChanges(r: ApplyResult): boolean {
  return r.created + r.restarted + r.replaced + r.removed > 0;
}

/**
 * One reconcile pass over every kh app on the machine, driven by the desired
 * state in each app's meta record (with replica labels as fallback). Returns
 * reports only for apps where something actually had to be fixed.
 *
 * `lastUnhealthyRestart` carries per-replica restart timestamps between
 * passes (keyed by container *name* — ids change on replacement) so a
 * permanently sick replica is restarted at most once per `backoffMs`
 * instead of on every pass.
 */
export async function reconcilePass(
  docker: Docker,
  lastUnhealthyRestart: Map<string, number>,
  backoffMs: number
): Promise<ReconcileReport[]> {
  const reports: ReconcileReport[] = [];
  for (const state of await listApps(docker)) {
    const { app, spec } = state;
    if (!spec) continue; // no readable spec label; not kh's to manage

    const manifest: AppManifest = {
      apiVersion: "kh/v1",
      kind: "App",
      metadata: { name: app },
      spec,
    };
    const result = await applyApp(docker, manifest);

    const restartedUnhealthy: string[] = [];
    for (const c of await listManaged(docker, app)) {
      if (c.state !== "running" || c.health !== "unhealthy") continue;
      const last = lastUnhealthyRestart.get(c.name) ?? 0;
      if (Date.now() - last < backoffMs) continue;
      await docker.getContainer(c.id).restart();
      lastUnhealthyRestart.set(c.name, Date.now());
      restartedUnhealthy.push(c.name);
    }

    if (hasChanges(result) || restartedUnhealthy.length > 0) {
      reports.push({ app, result, restartedUnhealthy });
    }
  }
  return reports;
}
