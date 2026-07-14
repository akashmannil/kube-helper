import { z } from "zod";

/** DNS-label style names, same rule Kubernetes uses for object names. */
const NAME_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** YAML authors naturally write env values as numbers/booleans; coerce them to strings. */
const envValue = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v));

const portSchema = z.strictObject({
  container: z.number().int().min(1).max(65535),
  host: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

const volumeSchema = z
  .strictObject({
    /** Managed volume: kh creates `kh-<app>-<name>-<replica>` per replica. */
    name: z.string().regex(NAME_REGEX, "must be a DNS-style label").optional(),
    /** Bind mount: a host path (absolute, or relative to the manifest file). */
    host: z.string().min(1).optional(),
    mount: z.string().regex(/^\//, "must be an absolute path inside the container"),
    readOnly: z.boolean().default(false),
  })
  .refine((v) => (v.name !== undefined) !== (v.host !== undefined), {
    message: "specify exactly one of `name` (managed volume) or `host` (bind mount)",
  });

export const appManifestSchema = z.strictObject({
  apiVersion: z.literal("kh/v1"),
  kind: z.literal("App"),
  metadata: z.strictObject({
    name: z
      .string()
      .regex(NAME_REGEX, "must be a DNS-style label: lowercase letters, digits and dashes"),
  }),
  spec: z.strictObject({
    image: z.string().min(1),
    replicas: z.number().int().min(0).max(100).default(1),
    command: z.array(z.string()).optional(),
    env: z.record(z.string(), envValue).default({}),
    ports: z.array(portSchema).default([]),
    volumes: z.array(volumeSchema).default([]),
    restart: z.enum(["no", "always", "on-failure", "unless-stopped"]).default("always"),
  }),
});

export type AppManifest = z.infer<typeof appManifestSchema>;
export type AppSpec = AppManifest["spec"];
export type PortSpec = AppSpec["ports"][number];
export type VolumeSpec = AppSpec["volumes"][number];
