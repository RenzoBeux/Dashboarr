import Fastify from "fastify";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import QRCode from "qrcode";
import { getEnv } from "./env.js";
import { getDb, closeDb } from "./db/client.js";
import { ensureActiveToken, purgeExpiredTokens } from "./auth/pairing-tokens.js";
import { getWebhookSecret } from "./db/repos/settings.js";
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

async function printStartupPairing(publicUrl: string): Promise<void> {
  const { token } = ensureActiveToken();
  const payload = JSON.stringify({ url: publicUrl, token });

  console.log("\nScan this QR in Dashboarr → Settings → Backend:\n");
  try {
    const ascii = await QRCode.toString(payload, { type: "terminal", small: true });
    console.log(ascii);
  } catch {
    console.log(`  (QR render failed — enter URL + token manually)`);
  }
  console.log(`  URL:   ${publicUrl}`);
  console.log(`  Token: ${token}\n`);

  // Webhook URLs used to live on the /pair HTML page. They're printed here
  // instead so they stay out of any HTTP response.
  const webhookSecret = getWebhookSecret();
  const webhookBase = `${publicUrl}/webhooks`;
  console.log("Webhook URLs — paste into each service's Custom/Webhook connection:");
  for (const id of SERVICE_IDS) {
    if (id === "qbittorrent" || id === "prowlarr" || id === "plex" || id === "glances") continue;
    console.log(`  ${id.padEnd(10)} ${webhookBase}/${id}/${webhookSecret}`);
  }
  console.log("");
}

async function main(): Promise<void> {
  const env = getEnv();
  console.log(BANNER);

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

  // Rate-limit pairing endpoints specifically.
  app.register(async (scope) => {
    await scope.register(rateLimit, { max: 5, timeWindow: "1 minute" });
    await pairRoutes(scope);
  });

  await app.register(async (scope) => {
    await healthRoutes(scope);
    await deviceRoutes(scope);
    await configRoutes(scope);
    await notificationRoutes(scope);
    await radarrWebhook(scope);
    await sonarrWebhook(scope);
    await overseerrWebhook(scope);
    await bazarrWebhook(scope);
    await tautulliWebhook(scope);
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
  const publicUrl = env.PUBLIC_URL?.replace(/\/$/, "") ?? address;
  await printStartupPairing(publicUrl);

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
