import type { FastifyInstance } from "fastify";
import { requireBearer } from "../auth/bearer.js";
import { deviceRegisterSchema } from "../types.js";
import { deleteDevice, updateDevicePushToken } from "../db/repos/devices.js";

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/device/register", { preHandler: requireBearer }, async (request, reply) => {
    const parsed = deviceRegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", issues: parsed.error.issues });
    }
    const device = request.device;
    if (!device) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    updateDevicePushToken(device.id, parsed.data.expoPushToken);
    return { ok: true };
  });

  app.post("/device/unregister", { preHandler: requireBearer }, async (request, reply) => {
    const device = request.device;
    if (!device) {
      return reply.code(401).send({ error: "unauthenticated" });
    }
    deleteDevice(device.id);
    return { ok: true };
  });
}
