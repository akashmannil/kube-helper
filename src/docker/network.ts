import type Docker from "dockerode";
import { MANAGED_LABEL } from "../labels.js";

/**
 * The one shared bridge network every kh replica joins — kh's answer to the
 * flat Kubernetes pod network. On a user-defined bridge Docker's embedded DNS
 * resolves container names, and every replica additionally carries its app
 * name as a network alias, so `http://<app>` resolves to the app's replicas
 * (crude DNS round-robin) from any other kh container.
 */
export const KH_NETWORK = "kh";

export async function ensureKhNetwork(docker: Docker): Promise<"present" | "created"> {
  // The name filter is a substring match; verify exact equality.
  const networks = await docker.listNetworks({ filters: { name: [KH_NETWORK] } });
  if (networks.some((n) => n.Name === KH_NETWORK)) return "present";
  await docker.createNetwork({
    Name: KH_NETWORK,
    Driver: "bridge",
    Labels: { [MANAGED_LABEL]: "true" },
  });
  return "created";
}

/** Remove the kh network if it exists and nothing is attached; quiet otherwise. */
export async function removeKhNetworkIfIdle(docker: Docker): Promise<boolean> {
  try {
    await docker.getNetwork(KH_NETWORK).remove();
    return true;
  } catch {
    return false; // absent, or still has attached containers
  }
}
