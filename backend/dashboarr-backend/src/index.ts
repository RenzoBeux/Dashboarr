import { writeFile } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import QRCode from "qrcode";
import { getEnv } from "./env.js";
import { getDb, closeDb } from "./db/client.js";
import { ensureActiveToken, purgeExpiredTokens } from "./auth/pairing-tokens.js";
import { getWebhookSecret } from "./db/repos/settings.js";
import { isEncryptionEnabled } from "./crypto/secrets.js";
import { SERVICE_IDS } from "./types.js";
import { initScheduler, getScheduler } from "./workers/scheduler.js";
import { healthRoutes } from "./routes/health.js";
import { pairRoutes } from "./routes/pair.js";
import { deviceRoutes } from "./routes/device.js";
import { configRoutes } from "./routes/config.js";
import { notificationRoutes } from "./routes/notifications.js";
import { radarrWebhook } from "./routes/webhooks/radarr.js";
import { sonarrWebhook } from "./routes/webhooks/sonarr.js";
import { overseerrWebhook } from "./routes/webhooks/overseerr.js";
import { bazarrWebhook } from "./routes/webhooks/bazarr.js";
import { tautulliWebhook } from "./routes/webhooks/tautulli.js";

const BANNER = `
===============================================================================
  Dashboarr Backend — self-hosted companion for the Dashboarr mobile app
-------------------------------------------------------------------------------
  🚨 OPERATOR WARNING 🚨
  This backend POSTs to https://exp.host/--/api/v2/push/send with NO auth.
  That only works while Expo's "Enhanced Security for Push Notifications"
  is DISABLED on the shared projectId. If that feature is ever turned on,
  every self-hosted backend silently stops delivering pushes.
===============================================================================
`;

async function writeWebhookUrlsFile(publicUrl: string, dataDir: string): Promise<string> {
  const webhookSecret = getWebhookSecret();
  const webhookBase = `${publicUrl}/webhooks`;
  const lines: string[] = [
    "# Dashboarr webhook URLs",
    "# Copy into each service's Custom / Webhook notification connection.",
    "#",
    "# Preferred — use a custom header (keeps the secret out of reverse-proxy access logs):",
    `#   URL:    ${webhookBase}/<service>`,
    `#   Header: X-Dashboarr-Secret: ${webhookSecret}`,
    "#",
    "# Back-compat — secret in the URL path (works with services that can't send custom headers):",
  ];
  for (const id of SERVICE_IDS) {
    if (id === "qbittorrent" || id === "prowlarr" || id === "plex" || id === "glances") continue;
    lines.push(`${id.padEnd(10)} ${webhookBase}/${id}/${webhookSecret}`);
  }
  const content = lines.join("\n") + "\n";
  const filePath = path.resolve(dataDir, "webhook-urls.txt");
  // mode 0600 so only the backend's user can read the secret at rest.
  await writeFile(filePath, content, { mode: 0o600 });
  return filePath;
}

async function printStartupPairing(
  publicUrl: string,
  hasPublicUrl: boolean,
  dataDir: string,
): Promise<void> {
  const { token } = ensureActiveToken();

  // If the operator set PUBLIC_URL the QR encodes both the URL and the token
  // so the app can pair in a single scan. Otherwise just the token — the user
  // enters the URL manually in the app.
  const qrPayload = hasPublicUrl
    ? JSON.stringify({ url: publicUrl, token })
    : token;

  console.log("\nScan this QR in Dashboarr → Settings → Backend:\n");
  try {
    const ascii = await QRCode.toString(qrPayload, { type: "terminal", small: true });
    console.log(ascii);
  } catch {
    console.log(`  (QR render failed — enter token manually)`);
  }
  console.log(`  URL:   ${publicUrl}`);
  console.log(`  Token: ${token}`);
  console.log(`  (Token expires in ~10 minutes. It's a one-shot credential — once claimed or expired, it becomes useless.)\n`);

  // Webhook secrets are durable (no TTL) so they must NOT go to stdout — stdout
  // commonly gets shipped to log aggregators (Loki, Grafana Cloud, Datadog),
  // where broader-than-intended read access would leak the secret.
  try {
    const filePath = await writeWebhookUrlsFile(publicUrl, dataDir);
    console.log(`Webhook URLs written to: ${filePath}`);
    console.log(`  View with:  cat ${filePath}\n`);
  } catch (err) {
    console.warn("Failed to write webhook URLs file:", err);
  }
}

async function main(): Promise<void> {
  const env = getEnv();
  console.log(BANNER);

  if (isEncryptionEnabled()) {
    console.log("🔒 CONFIG_ENCRYPTION_KEY set — service credentials encrypted at rest (AES-256-GCM).\n");
  } else {
    console.log("⚠️  CONFIG_ENCRYPTION_KEY not set — service credentials stored in plaintext in SQLite. Set it to enable encryption at rest.\n");
  }

  // Ensure DB is initialized and the webhook secret exists before any request lands
  getDb();
  getWebhookSecret();
  purgeExpiredTokens();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Custom req serializer. Fastify's default logs `req.url` raw, which
      // means the webhook secret embedded in `/webhooks/:svc/:secret` ends up
      // in every request log line and in anything the logs are shipped to.
      // Redact it here so the secret never leaves stdout.
      serializers: {
        req(req: FastifyRequest) {
          const url = req.url.replace(
            /^(\/webhooks\/[^/?#]+)\/[^/?#]+/,
            "$1/<redacted>",
          );
          return {
            method: req.method,
            url,
            hostname: req.hostname,
            remoteAddress: req.ip,
            remotePort: req.socket?.remotePort,
          };
        },
      },
    },
    bodyLimit: 1024 * 1024, // 1MB
    trustProxy: env.TRUST_PROXY,
  });

  // Global error handler. Most routes already return explicit `{ error }`
  // bodies, but any unhandled throw would otherwise flow through Fastify's
  // default handler and echo `err.message` back to the client — potentially
  // leaking SQLite errors, filesystem paths, or future dev-only messages.
  app.setErrorHandler((err: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Validation errors (Fastify's own schema layer) stay 400 with a generic tag.
    if (err.validation) {
      return reply.code(400).send({ error: "invalid_payload" });
    }
    // Rate-limit and other intentional 4xx replies keep their codes but
    // return a neutral body so we don't echo framework-authored strings.
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? "client_error" });
    }
    // Anything else → log the real error, respond with a neutral 500.
    request.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "internal_error" });
  });

  await app.register(rateLimit, {
    global: false,
  });

  // /pair/* — tight cap. Claiming a token is a one-shot credential exchange;
  // anything above a handful of requests per minute is abuse.
  app.register(async (scope) => {
    await scope.register(rateLimit, { max: 5, timeWindow: "1 minute" });
    await pairRoutes(scope);
  });

  // /webhooks/* — higher cap to absorb legitimate bursts when a user queues
  // many downloads at once, but still bounded so a leaked secret can't be
  // used to flood notifications.
  await app.register(async (scope) => {
    await scope.register(rateLimit, { max: 60, timeWindow: "1 minute" });
    await radarrWebhook(scope);
    await sonarrWebhook(scope);
    await overseerrWebhook(scope);
    await bazarrWebhook(scope);
    await tautulliWebhook(scope);
  });

  // Everything else (bearer-authed app traffic): a reasonable ceiling that
  // lets the app poll /health every few seconds and sync /config on demand
  // without tripping, while still capping what a stolen bearer can do.
  await app.register(async (scope) => {
    await scope.register(rateLimit, { max: 120, timeWindow: "1 minute" });
    await healthRoutes(scope);
    await deviceRoutes(scope);
    await configRoutes(scope);
    await notificationRoutes(scope);
  });

  // Start the polling scheduler. Will pick up whatever config has been synced.
  initScheduler();

  // Periodically purge claimed + long-expired pairing tokens so the table
  // doesn't grow unbounded between restarts.
  const purgeHandle = setInterval(
    () => {
      try {
        purgeExpiredTokens();
      } catch (err) {
        app.log.warn({ err }, "purgeExpiredTokens failed");
      }
    },
    6 * 60 * 60 * 1000, // 6h
  );
  purgeHandle.unref();

  const address = await app.listen({ port: env.PORT, host: env.HOST });
  const hasPublicUrl = !!env.PUBLIC_URL;
  const publicUrl = env.PUBLIC_URL?.replace(/\/$/, "") ?? address;
  await printStartupPairing(publicUrl, hasPublicUrl, env.DATA_DIR);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down`);
    try {
      clearInterval(purgeHandle);
      getScheduler()?.stop();
      await app.close();
      closeDb();
      process.exit(0);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
