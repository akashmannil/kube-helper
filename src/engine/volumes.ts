import type Docker from "dockerode";
import { APP_LABEL, MANAGED_LABEL, REPLICA_LABEL, VOLUME_LABEL } from "../labels.js";

/** Volume name for `volume` of app `app`, replica `index` (e.g. kh-db-data-0). */
export function managedVolumeName(app: string, volume: string, index: number): string {
  return `kh-${app}-${volume}-${index}`;
}

/**
 * Make sure the managed volume exists, labelled so kh can find it again.
 * Volumes are per replica: two database replicas sharing one data directory
 * is corruption, not high availability.
 */
export async function ensureVolume(
  docker: Docker,
  app: string,
  volume: string,
  index: number
): Promise<string> {
  const name = managedVolumeName(app, volume, index);
  await docker.createVolume({
    // createVolume is idempotent: an existing name is returned unchanged.
    Name: name,
    Labels: {
      [MANAGED_LABEL]: "true",
      [APP_LABEL]: app,
      [VOLUME_LABEL]: volume,
      [REPLICA_LABEL]: String(index),
    },
  });
  return name;
}

/** Names of kh-managed volumes, optionally restricted to one app. */
export async function listManagedVolumes(docker: Docker, app?: string): Promise<string[]> {
  const labelFilters = [`${MANAGED_LABEL}=true`];
  if (app) labelFilters.push(`${APP_LABEL}=${app}`);
  const { Volumes } = await docker.listVolumes({ filters: { label: labelFilters } });
  return (Volumes ?? []).map((v) => v.Name).sort();
}
