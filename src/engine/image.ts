import type Docker from "dockerode";

function statusCodeOf(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

/**
 * Make sure `image` exists locally, pulling it if necessary.
 * Returns "present" (already local) or "pulled".
 */
export async function ensureImage(
  docker: Docker,
  image: string,
  onStatus?: (msg: string) => void
): Promise<"present" | "pulled"> {
  try {
    await docker.getImage(image).inspect();
    return "present";
  } catch (err) {
    if (statusCodeOf(err) !== 404) throw err;
  }

  onStatus?.(`Pulling image ${image} …`);
  const stream = await docker.pull(image);
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err) => (err ? reject(err) : resolve()));
  });
  onStatus?.(`Pulled ${image}`);
  return "pulled";
}
