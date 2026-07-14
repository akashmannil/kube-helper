import type Docker from "dockerode";
import { setTimeout as sleep } from "node:timers/promises";
import { ensureKhNetwork, KH_NETWORK } from "../docker/network.js";
import {
  APP_LABEL,
  MANAGED_LABEL,
  REPLICA_LABEL,
  ROLE_LABEL,
  SPEC_HASH_LABEL,
  SPEC_LABEL,
  containerName,
  metaContainerName,
} from "../labels.js";
import type { AppManifest, AppSpec } from "../manifest/schema.js";
import { canonicalJson, specHash } from "./hash.js";
import { ensureImage } from "./image.js";
import { listManaged } from "./state.js";
import { ensureVolume } from "./volumes.js";

export interface ApplyResult {
  app: string;
  image: "present" | "pulled";
  created: number;
  restarted: number;
  replaced: number;
  removed: number;
  unchanged: number;
}

export interface ApplyOptions {
  /** How long a replaced replica may take to become ready (default 60 s). */
  readyTimeoutMs?: number;
}

/**
 * Reconcile one app to its manifest — the heart of kh.
 *
 * For each desired replica index:
 *   - no container            → create + start
 *   - container, same spec:
 *       running               → leave alone
 *       stopped               → start it
 *   - container, changed spec → remove + recreate, then WAIT until the new
 *     replica is ready (running, and healthy if probed) before touching the
 *     next index — a rolling update. With ≥2 replicas an image upgrade never
 *     takes the whole app down; if a new replica never becomes ready the
 *     rollout aborts and the remaining replicas keep running the old spec.
 * Containers with an index beyond `replicas` are removed (scale-down).
 */
export async function applyApp(
  docker: Docker,
  manifest: AppManifest,
  onStatus?: (msg: string) => void,
  options: ApplyOptions = {}
): Promise<ApplyResult> {
  const app = manifest.metadata.name;
  const spec = manifest.spec;
  const hash = specHash(spec);

  const result: ApplyResult = {
    app,
    image: "present",
    created: 0,
    restarted: 0,
    replaced: 0,
    removed: 0,
    unchanged: 0,
  };

  // The image is needed even at 0 replicas: the meta record is a container.
  result.image = await ensureImage(docker, spec.image, onStatus);
  if (spec.replicas > 0 && (await ensureKhNetwork(docker)) === "created") {
    onStatus?.(`Created the shared "${KH_NETWORK}" network`);
  }

  const all = await listManaged(docker, app, { includeMeta: true });
  const existing = all.filter((c) => c.role === "replica");
  const meta = all.find((c) => c.role === "meta");

  // Record desired state *first* (kubernetes writes the Deployment before the
  // controller converges): if reconciliation is interrupted, a later pass
  // still knows what the user asked for.
  if (!meta || !meta.spec || canonicalJson(meta.spec) !== canonicalJson(spec)) {
    if (meta) await docker.getContainer(meta.id).remove({ force: true });
    await createMeta(docker, app, spec, hash);
  }

  const byReplica = new Map(existing.map((c) => [c.replica, c]));

  for (let i = 0; i < spec.replicas; i++) {
    const current = byReplica.get(i);

    if (!current) {
      await createReplica(docker, app, i, spec, hash);
      result.created++;
      continue;
    }

    if (current.specHash === hash) {
      if (current.state === "running") {
        result.unchanged++;
      } else {
        await docker.getContainer(current.id).start();
        result.restarted++;
      }
      continue;
    }

    // Spec changed: replace this replica (old one goes first to free its name/ports).
    await docker.getContainer(current.id).remove({ force: true });
    await createReplica(docker, app, i, spec, hash);
    result.replaced++;
    onStatus?.(`rolling update: replica ${i} replaced, waiting until ready…`);
    await waitForReplicaReady(docker, app, i, options.readyTimeoutMs ?? 60_000);
    onStatus?.(`rolling update: replica ${i} is ready`);
  }

  for (const c of existing) {
    if (c.replica >= spec.replicas) {
      await docker.getContainer(c.id).remove({ force: true });
      result.removed++;
    }
  }

  return result;
}

/**
 * The app's desired-state record: a container that is created but never
 * started (state "created", no process, no network, no ports). It exists only
 * to carry the authoritative kh.spec label, surviving replica churn, crashes
 * and scale-to-zero — kh's equivalent of a Deployment object, still with no
 * database anywhere.
 */
async function createMeta(docker: Docker, app: string, spec: AppSpec, hash: string): Promise<void> {
  await docker.createContainer({
    name: metaContainerName(app),
    Image: spec.image,
    Entrypoint: ["true"],
    Labels: {
      [MANAGED_LABEL]: "true",
      [APP_LABEL]: app,
      [ROLE_LABEL]: "meta",
      [SPEC_HASH_LABEL]: hash,
      [SPEC_LABEL]: JSON.stringify(spec),
    },
    HostConfig: { NetworkMode: "none" },
  });
}

/**
 * Poll until replica `index` is ready. Fails fast if the container dies
 * (exited/dead) instead of burning the whole timeout.
 */
async function waitForReplicaReady(
  docker: Docker,
  app: string,
  index: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const name = containerName(app, index);
  for (;;) {
    const replica = (await listManaged(docker, app)).find((c) => c.replica === index);
    if (replica?.ready) return;
    if (replica && ["exited", "dead"].includes(replica.state)) {
      throw new Error(
        `rolling update aborted: ${name} entered state "${replica.state}" — remaining replicas keep the old spec`
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `rolling update aborted: ${name} not ready after ${Math.round(timeoutMs / 1000)}s — remaining replicas keep the old spec`
      );
    }
    await sleep(500);
  }
}

function restartPolicy(restart: AppSpec["restart"]): { Name: string; MaximumRetryCount?: number } {
  switch (restart) {
    case "no":
      return { Name: "" };
    case "on-failure":
      return { Name: "on-failure", MaximumRetryCount: 0 };
    default:
      return { Name: restart };
  }
}

async function createReplica(
  docker: Docker,
  app: string,
  index: number,
  spec: AppSpec,
  hash: string
): Promise<void> {
  const exposedPorts: Record<string, object> = {};
  const portBindings: Record<string, Array<{ HostPort: string }>> = {};
  for (const p of spec.ports) {
    const key = `${p.container}/${p.protocol}`;
    exposedPorts[key] = {};
    // Fixed host ports auto-increment per replica so replicas never collide;
    // without `host` Docker assigns a free ephemeral port.
    portBindings[key] = [{ HostPort: p.host !== undefined ? String(p.host + index) : "" }];
  }

  // Structured Mounts (not Binds strings): Windows host paths contain colons.
  const mounts = [];
  for (const v of spec.volumes) {
    mounts.push({
      Type: (v.name !== undefined ? "volume" : "bind") as "volume" | "bind",
      Source: v.name !== undefined ? await ensureVolume(docker, app, v.name, index) : v.host!,
      Target: v.mount,
      ReadOnly: v.readOnly,
    });
  }

  const SECOND = 1_000_000_000; // Docker healthcheck durations are nanoseconds
  const hc = spec.healthcheck;

  const container = await docker.createContainer({
    name: containerName(app, index),
    Image: spec.image,
    Cmd: spec.command,
    Env: Object.entries(spec.env).map(([k, v]) => `${k}=${v}`),
    Healthcheck: hc
      ? {
          Test: hc.exec ? ["CMD", ...hc.exec] : ["CMD-SHELL", hc.shell ?? ""],
          Interval: hc.intervalSeconds * SECOND,
          Timeout: hc.timeoutSeconds * SECOND,
          Retries: hc.retries,
          StartPeriod: hc.startPeriodSeconds * SECOND,
        }
      : undefined,
    Labels: {
      [MANAGED_LABEL]: "true",
      [APP_LABEL]: app,
      [ROLE_LABEL]: "replica",
      [REPLICA_LABEL]: String(index),
      [SPEC_HASH_LABEL]: hash,
      [SPEC_LABEL]: JSON.stringify(spec),
    },
    ExposedPorts: exposedPorts,
    HostConfig: {
      PortBindings: portBindings,
      RestartPolicy: restartPolicy(spec.restart),
      Mounts: mounts,
    },
    NetworkingConfig: {
      EndpointsConfig: {
        // Container names resolve automatically on a user-defined network;
        // the app-name alias makes `http://<app>` reach any replica.
        [KH_NETWORK]: { Aliases: [app] },
      },
    },
  });
  await container.start();
}
