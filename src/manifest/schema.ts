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
    restart: z.enum(["no", "always", "on-failure", "unless-stopped"]).default("always"),
  }),
});

export type AppManifest = z.infer<typeof appManifestSchema>;
export type AppSpec = AppManifest["spec"];
export type PortSpec = AppSpec["ports"][number];
