/**
 * Docker labels through which kh recognises and manages its containers.
 * Labels are kh's only state store: everything needed to reconcile an app
 * (its spec, desired replica count) lives on the containers themselves,
 * so there is no local database to corrupt or go stale.
 */
export const MANAGED_LABEL = "kh.managed";
export const APP_LABEL = "kh.app";
export const REPLICA_LABEL = "kh.replica";
export const SPEC_HASH_LABEL = "kh.spec-hash";
export const SPEC_LABEL = "kh.spec";

/** Container name for replica `index` of app `name` (e.g. kh-web-0). */
export function containerName(app: string, index: number): string {
  return `kh-${app}-${index}`;
}
