import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getWebhookSecret } from "../../db/repos/settings.js";
import {
  countEnabledInstancesByKind,
  getServiceInstance,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import type { ServiceId } from "../../types.js";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface WebhookParams {
  secret?: string;
}

interface WebhookQuery {
  instance?: string;
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

/**
 * Resolve the optional `?instance=<uuid>` query param to the matching
 * service_instance row, scoped to a service kind. Used by per-service webhook
 * handlers to attribute the inbound event to a specific instance ("Radarr
 * Seedbox: Movie X downloaded" instead of "Radarr: Movie X downloaded").
 *
 * Returns null in two cases — both treated as "kind-only attribution":
 *  - The query param is absent (legacy webhook URL).
 *  - The param is present but doesn't match any enabled instance of `kind`
 *    (stale URL after the user deleted the instance, or kind mismatch from a
 *    misconfigured webhook URL pasted into the wrong service).
 *
 * We deliberately don't 4xx on a missing/unknown instance — the secret has
 * already been verified, the upstream service won't retry on a 4xx anyway,
 * and dropping the event silently is worse than emitting a kind-only push.
 */
export function resolveWebhookInstance(
  request: FastifyRequest<{ Querystring: WebhookQuery }>,
  kind: ServiceId,
): StoredServiceInstance | null {
  const id = request.query.instance;
  if (!id) return null;
  const inst = getServiceInstance(id);
  if (!inst) return null;
  if (inst.serviceId !== kind) return null;
  if (!inst.enabled) return null;
  return inst;
}

/**
 * Push title prefix for an attributed webhook event. Returns "" when there's
 * only one enabled instance of the kind (the prefix would be redundant: "Radarr:
 * Movie X" already implies the only Radarr) or when the instance isn't matched.
 */
export function webhookTitlePrefix(
  instance: StoredServiceInstance | null,
  kind: ServiceId,
): string {
  if (!instance) return "";
  const count = countEnabledInstancesByKind().get(kind) ?? 0;
  if (count <= 1) return "";
  return `${instance.name}: `;
}
