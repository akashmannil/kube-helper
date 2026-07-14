import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseAllDocuments } from "yaml";
import { appManifestSchema, type AppManifest } from "./schema.js";

/** A user-facing manifest problem: reported as a clean message, never a stack trace. */
export class ManifestError extends Error {}

export const DEFAULT_MANIFEST = "khapp.yaml";

/**
 * Load and validate every app manifest in a YAML file.
 * A file may contain several apps separated by `---`, like kubectl accepts.
 */
export async function loadManifests(filePath: string): Promise<AppManifest[]> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new ManifestError(
      `Cannot read manifest file "${filePath}". Pass one with -f <path> or create ${DEFAULT_MANIFEST}.`
    );
  }

  const docs = parseAllDocuments(text);
  const apps: AppManifest[] = [];

  docs.forEach((doc, i) => {
    const where = docs.length > 1 ? ` (document ${i + 1})` : "";
    const syntaxError = doc.errors[0];
    if (syntaxError) {
      throw new ManifestError(`YAML syntax error in "${filePath}"${where}:\n  ${syntaxError.message}`);
    }
    const value: unknown = doc.toJS();
    if (value == null) return; // empty document, e.g. a trailing `---`

    const result = appManifestSchema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      throw new ManifestError(`Invalid app manifest in "${filePath}"${where}:\n${issues}`);
    }

    // Bind-mount paths must be absolutized *now*, against the manifest's own
    // directory: the spec is stored on containers and later replayed by
    // scale/watch from a different working directory with no file in sight.
    const manifestDir = dirname(resolve(filePath));
    for (const volume of result.data.spec.volumes) {
      if (volume.host !== undefined && !isAbsolute(volume.host)) {
        volume.host = resolve(manifestDir, volume.host);
      }
    }

    apps.push(result.data);
  });

  if (apps.length === 0) {
    throw new ManifestError(`"${filePath}" contains no app manifests.`);
  }

  const seen = new Set<string>();
  for (const app of apps) {
    if (seen.has(app.metadata.name)) {
      throw new ManifestError(`Duplicate app name "${app.metadata.name}" in "${filePath}".`);
    }
    seen.add(app.metadata.name);
  }

  return apps;
}
