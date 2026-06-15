import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getWebhookSecret } from "../../db/repos/settings.js";
import {
  countEnabledInstancesByKind,
  getServiceInstance,
  getSoleEnabledInstanceByKind,
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
 * Resolve the inbound webhook to a specific service_instance, scoped to a kind.
 * Used by per-service webhook handlers to attribute the event ("Radarr Seedbox:
 * Movie X downloaded" instead of "Radarr: Movie X downloaded") AND to make the
 * dispatcher apply that instance's per-instance notification overrides.
 *
 * Resolution order:
 *  1. `?instance=<uuid>` — when present and it matches an enabled instance of
 *     `kind`, use it. A stale/mismatched id falls through to step 2.
 *  2. Sole-instance fallback — when there's exactly one enabled instance of
 *     `kind`, attribute to it. With a single instance there's no ambiguity about
 *     which one sent the event, and it lets per-instance notification overrides
 *     apply without the user appending `?instance=` to the webhook URL. This is
 *     essential for Tracearr, whose categories are per-instance-only and several
 *     of which default off — without it a user's "Always notify" never takes
 *     effect on the common single-instance, no-`?instance=` setup (issue #200).
 *  3. Otherwise null ("kind-only attribution") — 0 or >1 enabled instances and
 *     no usable `?instance=`.
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
  if (id) {
    const inst = getServiceInstance(id);
    if (inst && inst.serviceId === kind && inst.enabled) return inst;
    // Stale / kind-mismatched id — fall through to the sole-instance fallback.
  }
  return getSoleEnabledInstanceByKind(kind);
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
