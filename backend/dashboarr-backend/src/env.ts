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
  // Number of consecutive failed health checks before a service is declared
  // offline and a push notification is sent. Default 3 (≈1.5 min at 30s
  // interval). Raise to 10 for ~5 min tolerance (e.g. slow DDNS updates).
  OFFLINE_THRESHOLD: z.coerce.number().int().positive().default(3),
  // Which URL the backend uses when polling services. The mobile app's
  // `useRemote` flag is always ignored server-side — the backend typically
  // runs next to the services on the LAN, so routing its polls through a
  // public reverse proxy adds latency and breaks whenever DDNS churns.
  // Set to "true" only if the backend genuinely lives off-LAN from the stack.
  BACKEND_USE_REMOTE: z
    .string()
    .optional()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  // Optional passphrase used to encrypt per-service api_key/username/password
  // columns at rest in SQLite. When set, new writes are AES-256-GCM encrypted
  // with a key derived via SHA-256 from this value. Unset = legacy plaintext
  // (back-compat for existing deployments).
  //
  // IMPORTANT: losing this value makes previously-encrypted secrets
  // unrecoverable. Services with unrecoverable credentials will fail to poll
  // and you'll see a warning in the logs on startup.
  CONFIG_ENCRYPTION_KEY: z.string().min(16).optional(),
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
