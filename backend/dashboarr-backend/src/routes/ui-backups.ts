import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSameOrigin } from "../auth/same-origin.js";
import {
  deleteBackup,
  getBackup,
  upsertBackupIfRevision,
} from "../db/repos/config-backup.js";
import { backupSlotIdSchema, uiBackupPutSchema } from "../types.js";
import { WEB_SLOT_ID } from "../ui/overview-types.js";
import { BODY_LIMIT, WRITE_LIMIT } from "./config-backup.js";
import { requireUiSession, type UiRouteOptions } from "./ui.js";

/**
 * The web editor's backup routes (Refs #385), behind the UI session cookie.
 *
 * Reads hand back any slot's envelope: it is ciphertext the browser decrypts
 * with a passphrase the backend never sees, so this exposes nothing the
 * bearer routes do not. Writes go only to the reserved "web" slot, never to a
 * phone's, and carry the revision the editor loaded so a stale tab gets a 409
 * instead of clobbering a newer save. Writes also pass `requireSameOrigin`,
 * the CSRF gate the read-only model did not need.
 *
 * Logs record slot ids and sizes, never envelope contents.
 */

const slotParam = z.object({ id: backupSlotIdSchema });
const deleteBody = z.object({ expectedRevision: z.number().int().min(0).optional() }).strict();

export async function uiBackupRoutes(app: FastifyInstance, opts: UiRouteOptions): Promise<void> {
  const session = requireUiSession(opts);

  app.get<{ Params: { id: string } }>(
    "/ui/api/backups/:id/envelope",
    { preHandler: session },
    async (request, reply) => {
      const params = slotParam.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "invalid_payload" });
      const found = getBackup(params.data.id);
      if (!found) return reply.code(404).send({ error: "not_found" });
      request.log.info({ slot: found.meta.deviceId, bytes: found.meta.sizeBytes }, "web UI backup downloaded");
      return { ...found.meta, envelope: JSON.parse(found.envelope) as unknown };
    },
  );

  app.put(
    `/ui/api/backups/${WEB_SLOT_ID}`,
    {
      preHandler: [session, requireSameOrigin],
      bodyLimit: BODY_LIMIT,
      config: { rateLimit: WRITE_LIMIT },
    },
    async (request, reply) => {
      const parsed = uiBackupPutSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
      const { envelope, configVersion, exportedAt, expectedRevision } = parsed.data;
      const outcome = upsertBackupIfRevision(
        {
          deviceId: WEB_SLOT_ID,
          envelope: JSON.stringify(envelope),
          configVersion,
          exportedAt,
          platform: "web",
          appVersion: "web",
        },
        expectedRevision,
      );
      if (!outcome.ok) {
        request.log.info({ expectedRevision, current: outcome.current?.revision ?? null }, "web UI backup write conflict");
        return reply.code(409).send({ error: "conflict", current: outcome.current });
      }
      request.log.info(
        { slot: WEB_SLOT_ID, bytes: outcome.result.sizeBytes, configVersion, revision: outcome.result.revision },
        "web UI backup stored",
      );
      return { ok: true, ...outcome.result };
    },
  );

  app.delete(
    `/ui/api/backups/${WEB_SLOT_ID}`,
    { preHandler: [session, requireSameOrigin], config: { rateLimit: WRITE_LIMIT } },
    async (request, reply) => {
      const parsed = deleteBody.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });
      const existing = getBackup(WEB_SLOT_ID);
      if (!existing) return reply.code(404).send({ error: "not_found" });
      if (!deleteBackup(WEB_SLOT_ID, parsed.data.expectedRevision)) {
        return reply.code(409).send({ error: "conflict", current: existing.meta });
      }
      request.log.info({ slot: WEB_SLOT_ID }, "web UI backup deleted");
      return { ok: true };
    },
  );
}
