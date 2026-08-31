import type { FastifyInstance } from "fastify";
import { resolveBearer } from "../auth/bearer.js";
import { getScheduler } from "../workers/scheduler.js";
import { VERSION } from "../version.js";

/**
 * Two projections, selected by the Authorization header.
 *
 * Anonymous callers get liveness only: `{ ok, name }`. That is what a Docker
 * HEALTHCHECK, an uptime monitor, or a reverse-proxy probe needs. Answering
 * them 401 produced two duplicate "my reverse proxy must be broken" reports
 * (#357) and left containers permanently unhealthy, because busybox wget exits
 * non-zero on any status >= 400.
 *
 * The full body stays behind the bearer: `pollers[].lastError` embeds internal
 * service URLs (see ServiceHttpError in services/http.ts) and the poller list
 * itself reveals which services are configured. `version` and `expoAuth` are
 * authenticated too — version fingerprinting is free reconnaissance, and the
 * operator who wants it has the startup banner or a bearer.
 *
 * A malformed or unknown Bearer is still a 401 — see resolveBearer for why that
 * matters to the app.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (request, reply) => {
    // A caching proxy in front must never hand one projection to the other
    // audience — least of all the poller list to an anonymous caller.
    reply.header("Cache-Control", "no-store").header("Vary", "Authorization");

    const outcome = await resolveBearer(request, reply);
    if (outcome === null) return reply; // 401 already sent
    if (outcome === "anonymous") {
      // `ok` is liveness (the process answered), not readiness: a backend with
      // one failing poller is still up, and flipping this would make every
      // healthcheck restart the container over an unrelated service outage.
      return { ok: true, name: "dashboarr-backend" };
    }

    const scheduler = getScheduler();
    return {
      ok: true,
      name: "dashboarr-backend",
      version: VERSION,
      // Reminder surfaced on every health check. Flipping Expo "Enhanced
      // Security for Push Notifications" silently breaks every user-hosted
      // backend — this field is a canary for that misconfiguration.
      expoAuth: "must-be-disabled",
      pollers: scheduler?.status() ?? [],
      uptimeMs: Math.round(process.uptime() * 1000),
    };
  });
}
