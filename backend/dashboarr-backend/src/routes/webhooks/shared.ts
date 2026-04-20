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
  secret?: string;
}

/**
 * Verify the webhook secret, accepting it from either the `X-Dashboarr-Secret`
 * header (preferred — keeps the secret out of reverse-proxy access logs) or
 * the `:secret` URL path param (back-compat for existing Radarr/Sonarr/etc.
 * webhook configurations that pre-date header support).
 *
 * Returns true if the caller should continue processing, false if a 401 reply
 * was already sent.
 */
export async function checkWebhookSecret(
  request: FastifyRequest<{ Params: WebhookParams }>,
  reply: FastifyReply,
): Promise<boolean> {
  const expected = getWebhookSecret();
  const header = request.headers["x-dashboarr-secret"];
  const presentedHeader = typeof header === "string" ? header : "";
  const presentedPath = request.params.secret ?? "";
  const presented = presentedHeader || presentedPath;
  if (!presented || !safeEqual(expected, presented)) {
    await reply.code(401).send({ error: "invalid_secret" });
    return false;
  }
  return true;
}
