import type { FastifyInstance } from "fastify";
import { requireBearer } from "../auth/bearer.js";
import { dispatchPush } from "../push/dispatcher.js";
import { loadNotificationSettings } from "../db/repos/config.js";
import { sendApprise } from "../push/apprise.js";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/notifications/test", { preHandler: requireBearer }, async (request, reply) => {
    const device = request.device;
    if (!device) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    // Pin to an arbitrary category so TS is happy, but bypass the per-category
    // toggle — test pushes should work regardless of which categories the user
    // has disabled. The global `notifications.enabled` master flag still
    // applies, which is the desired UX.
    await dispatchPush({
      category: "torrentCompleted",
      bypassCategory: true,
      title: "Hello from Dashboarr backend",
      body: "If you see this, push notifications are working end-to-end.",
      data: { type: "test" },
    });
    return { ok: true };
  });

  // Apprise-only test (issue #220). Sends straight to Apprise (no device needed
  // — Apprise is device-independent) and surfaces the real result so the app can
  // tell the user exactly why it failed (unreachable server, unknown key, bad
  // tag). Independent of the global `notifications.enabled` master flag.
  app.post(
    "/notifications/apprise/test",
    { preHandler: requireBearer },
    async (_request, reply) => {
      const apprise = loadNotificationSettings().apprise;
      if (!apprise?.enabled || !apprise.url) {
        return reply.code(400).send({ error: "apprise_not_configured" });
      }
      try {
        await sendApprise(apprise, {
          title: "Dashboarr Apprise test",
          body: "If you see this, Apprise delivery is working end-to-end.",
        });
      } catch (err) {
        return reply.code(502).send({
          error: "apprise_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return { ok: true };
    },
  );
}
