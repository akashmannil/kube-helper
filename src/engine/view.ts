import type Docker from "dockerode";
import { listApps, type ManagedContainer } from "./state.js";

/** Serializable snapshots of kh state, shared by the web dashboard and the desktop app. */

export interface ReplicaView {
  name: string;
  replica: number;
  state: string;
  health: string | null;
  ready: boolean;
  status: string;
  ports: string[];
}

export interface AppView {
  name: string;
  image: string;
  desired: number;
  ready: number;
  ports: string[];
  /** Host ports (for "open in browser" affordances). */
  hostPorts: number[];
  replicas: ReplicaView[];
  /** The deployed spec, so GUIs can pre-fill edit forms. */
  spec?: unknown;
}

export interface EngineView {
  engine: string;
  api: string;
  os: string;
  arch: string;
  containersRunning: number;
  containers: number;
  images: number;
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

function hostPorts(containers: ManagedContainer[]): number[] {
  const seen = new Set<number>();
  for (const c of containers) {
    for (const p of c.ports) {
      if (p.host !== undefined) seen.add(p.host);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

export async function appsOverview(docker: Docker): Promise<{ apps: AppView[] }> {
  const apps = await listApps(docker);
  return {
    apps: apps.map((state) => ({
      name: state.app,
      image: state.spec?.image ?? state.replicas[0]?.image ?? "?",
      desired: state.spec?.replicas ?? state.replicas.length,
      ready: state.replicas.filter((c) => c.ready).length,
      ports: publishedPorts(state.replicas),
      hostPorts: hostPorts(state.replicas),
      spec: state.spec,
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

export async function engineOverview(docker: Docker): Promise<EngineView> {
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
