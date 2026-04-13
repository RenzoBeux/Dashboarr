import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getWebhookSecret } from "../../db/repos/settings.js";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface WebhookParams {
  secret: string;
}

/**
 * Shared handler that verifies the `:secret` path param for webhook routes.
 * Returns true if the caller should continue processing, false if reply was sent.
 */
export async function checkWebhookSecret(
  request: FastifyRequest<{ Params: WebhookParams }>,
  reply: FastifyReply,
): Promise<boolean> {
  const expected = getWebhookSecret();
  if (!safeEqual(expected, request.params.secret)) {
    await reply.code(401).send({ error: "invalid_secret" });
    return false;
  }
  return true;
}
