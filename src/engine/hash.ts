import { createHash } from "node:crypto";
import type { AppSpec } from "../manifest/schema.js";

/** JSON.stringify with recursively sorted object keys, so hashing is order-independent. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Short content hash of a fully-defaulted spec. Stored as a label on every
 * container; a mismatch between manifest hash and container hash is how kh
 * decides a replica must be replaced.
 */
export function specHash(spec: AppSpec): string {
  return createHash("sha256").update(canonicalJson(spec)).digest("hex").slice(0, 12);
}
