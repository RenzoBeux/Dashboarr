import type { FastifyInstance } from "fastify";
import { requireBearer } from "../auth/bearer.js";
import { dispatchPush } from "../push/dispatcher.js";

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
}
