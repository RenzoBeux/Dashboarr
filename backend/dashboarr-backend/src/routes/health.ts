import type { FastifyInstance } from "fastify";
import { requireBearer } from "../auth/bearer.js";
import { getScheduler } from "../workers/scheduler.js";

/**
 * /health is intentionally behind `requireBearer`. Unauthenticated callers
 * would otherwise learn which services are configured and could read
 * `pollers[].lastError`, which includes internal service URLs embedded in
 * `ServiceHttpError.message` (see services/http.ts). The frontend already
 * holds a bearer, so requiring it here costs nothing.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", { preHandler: requireBearer }, async () => {
    const scheduler = getScheduler();
    return {
      ok: true,
      name: "dashboarr-backend",
      version: "0.1.0",
      // Reminder surfaced on every health check. Flipping Expo "Enhanced
      // Security for Push Notifications" silently breaks every user-hosted
      // backend — this field is a canary for that misconfiguration.
      expoAuth: "must-be-disabled",
      pollers: scheduler?.status() ?? [],
      uptimeMs: Math.round(process.uptime() * 1000),
    };
  });
}
