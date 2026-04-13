import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATA_DIR: z.string().default("./data"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PUBLIC_URL: z.string().optional(),
  // When set, the Expo push-receipts poller runs 15min after each send.
  // Off by default — fire-and-forget is fine for a personal deployment.
  PUSH_RECEIPTS: z.coerce.boolean().default(false),
  // Honor X-Forwarded-* headers. Off by default; only enable when the backend
  // is deployed behind a reverse proxy you control (Caddy / Nginx / Traefik).
  // With this off, client IPs used by the rate limiter are the socket peer.
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.format());
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
