import Docker from "dockerode";

const WINDOWS_PIPE = "//./pipe/docker_engine";
const UNIX_SOCKET = "/var/run/docker.sock";

export interface ClientOptions {
  /** Per-request timeout. Only set this for short, interactive calls (e.g. doctor). */
  timeoutMs?: number;
}

/** Human-readable description of the endpoint kh will talk to (for diagnostics). */
export function connectionTarget(): string {
  const host = process.env.DOCKER_HOST;
  if (host) return `${host} (from DOCKER_HOST)`;
  return process.platform === "win32" ? `npipe://${WINDOWS_PIPE}` : `unix://${UNIX_SOCKET}`;
}

/**
 * Build a Docker Engine API client.
 *
 * Resolution order mirrors the docker CLI: an explicit DOCKER_HOST wins
 * (unix://, npipe://, tcp:// or http(s)://), otherwise the platform default
 * local endpoint is used.
 */
export function createDockerClient(options: ClientOptions = {}): Docker {
  const timeout = options.timeoutMs;
  const host = process.env.DOCKER_HOST;

  if (host) {
    if (host.startsWith("unix://")) {
      return new Docker({ socketPath: host.slice("unix://".length), timeout });
    }
    if (host.startsWith("npipe://")) {
      return new Docker({ socketPath: host.slice("npipe://".length), timeout });
    }
    if (/^(tcp|https?):\/\//.test(host)) {
      const url = new URL(host.replace(/^tcp:/, "http:"));
      return new Docker({
        host: url.hostname,
        port: url.port ? Number(url.port) : 2375,
        protocol: host.startsWith("https://") ? "https" : "http",
        timeout,
      });
    }
    throw new Error(
      `Unsupported DOCKER_HOST "${host}" — expected unix://, npipe://, tcp:// or http(s)://.`
    );
  }

  return new Docker({
    socketPath: process.platform === "win32" ? WINDOWS_PIPE : UNIX_SOCKET,
    timeout,
  });
}

/** The hint shown when the daemon cannot be reached. */
export function daemonStartHint(): string {
  if (process.platform === "win32" || process.platform === "darwin") {
    return "Start Docker Desktop and wait until it reports \"Engine running\", then retry.";
  }
  return "Start the daemon with: sudo systemctl start docker";
}
