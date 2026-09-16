import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireBearer } from "../auth/bearer.js";
import {
  deleteBackup,
  getBackup,
  listBackupMeta,
  upsertBackup,
} from "../db/repos/config-backup.js";
import { configBackupPutSchema, MAX_BACKUP_CIPHERTEXT_CHARS } from "../types.js";

/**
 * Per-device config backup slots (Refs #385) — security model
 * -----------------------------------------------------------
 * The body is the app's passphrase-encrypted export envelope. The backend
 * validates its shape and stores it verbatim; it never sees the passphrase
 * and cannot decrypt it. That is what makes the read routes acceptable
 * where GET /config is not (see routes/config.ts): a paired bearer can
 * already rewrite the whole config, so handing it ciphertext it cannot open
 * adds no privilege. Any paired device may read or delete any slot — that
 * is the sharing flow (a second phone pairs, restores, and only the
 * passphrase changes hands). What a stolen bearer gains is an offline
 * guessing target for the passphrase, which the README documents.
 *
 * Slots are keyed by devices.id and outlive the device row on purpose (see
 * db/repos/config-backup.ts). PUT always writes the caller's own slot.
 *
 * The 1 MB global bodyLimit is raised per route here: a large real config is
 * a few hundred KB once hex-encoded, so 4 MB is generous and still bounded.
 * PUT and DELETE get a tighter rate limit than the surrounding 120/min scope
 * because each one is a full-row SQLite write.
 */

const BODY_LIMIT = MAX_BACKUP_CIPHERTEXT_CHARS + 64 * 1024;
const WRITE_LIMIT = { max: 10, timeWindow: "1 minute" };

const deviceIdParam = z.object({ deviceId: z.string().uuid() });

export async function configBackupRoutes(app: FastifyInstance): Promise<void> {
  app.put(
    "/config/backup",
    { preHandler: requireBearer, bodyLimit: BODY_LIMIT, config: { rateLimit: WRITE_LIMIT } },
    async (request, reply) => {
      const device = request.device;
      if (!device) return reply.code(401).send({ error: "unauthenticated" });
      const parsed = configBackupPutSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_payload" });
      }
      const { envelope, configVersion, exportedAt, appVersion } = parsed.data;
      const result = upsertBackup({
        deviceId: device.id,
        envelope: JSON.stringify(envelope),
        configVersion,
        exportedAt,
        platform: device.platform,
        appVersion: appVersion ?? device.appVersion,
      });
      request.log.info(
        { deviceId: device.id, bytes: result.sizeBytes, configVersion },
        "config backup stored",
      );
      return { ok: true, updatedAt: result.updatedAt, sizeBytes: result.sizeBytes };
    },
  );

  app.get("/config/backups", { preHandler: requireBearer }, async (request, reply) => {
    const device = request.device;
    if (!device) return reply.code(401).send({ error: "unauthenticated" });
    return {
      backups: listBackupMeta().map((m) => ({ ...m, mine: m.deviceId === device.id })),
    };
  });

  app.get<{ Params: { deviceId: string } }>(
    "/config/backups/:deviceId",
    { preHandler: requireBearer },
    async (request, reply) => {
      const device = request.device;
      if (!device) return reply.code(401).send({ error: "unauthenticated" });
      const params = deviceIdParam.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_payload" });
      const found = getBackup(params.data.deviceId);
      if (!found) return reply.code(404).send({ error: "not_found" });
      request.log.info(
        { deviceId: device.id, slot: found.meta.deviceId, bytes: found.meta.sizeBytes },
        "config backup downloaded",
      );
      return {
        ...found.meta,
        mine: found.meta.deviceId === device.id,
        envelope: JSON.parse(found.envelope) as unknown,
      };
    },
  );

  app.delete<{ Params: { deviceId: string } }>(
    "/config/backups/:deviceId",
    { preHandler: requireBearer, config: { rateLimit: WRITE_LIMIT } },
    async (request, reply) => {
      const device = request.device;
      if (!device) return reply.code(401).send({ error: "unauthenticated" });
      const params = deviceIdParam.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_payload" });
      if (!deleteBackup(params.data.deviceId)) {
        return reply.code(404).send({ error: "not_found" });
      }
      request.log.info({ deviceId: device.id, slot: params.data.deviceId }, "config backup deleted");
      return { ok: true };
    },
  );
}
