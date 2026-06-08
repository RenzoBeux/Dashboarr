import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { dispatchPush } from "../../push/dispatcher.js";
import {
  checkWebhookSecret,
  resolveWebhookInstance,
  webhookTitlePrefix,
} from "./shared.js";

/**
 * Tracearr "JSON Webhook" notification agent payload. Every event arrives as
 * `{ event, timestamp, data }`; the `data` shape varies per `event`. We type it
 * loosely (all optional) because the upstream shape isn't a contract we control
 * and we only read a handful of fields per event.
 *
 * Tracearr can only send `Content-Type: application/json` (plus an optional
 * `Authorization: Basic` extracted from URL-embedded credentials) — it cannot
 * add a custom header. So the user must point it at the path-secret URL form
 * (`/webhooks/tracearr/<secret>`), which `checkWebhookSecret` accepts.
 *
 * Default channel routing in Tracearr enables violation/new_device/server_*
 * out of the box and leaves trust_score/stream_* off (the user opts in). Our
 * per-category defaults below mirror that.
 */
interface TracearrUser {
  username?: string;
  displayName?: string;
}
interface TracearrWebhookPayload {
  event?: string;
  timestamp?: string;
  data?: {
    message?: string;
    // violation_detected
    user?: TracearrUser;
    rule?: { name?: string };
    violation?: { id?: string | number; severity?: string };
    // new_device
    userName?: string;
    deviceName?: string;
    location?: string | null;
    // trust_score_changed
    previousScore?: number;
    newScore?: number;
    reason?: string | null;
    // server_down / server_up
    serverName?: string;
    // stream_started / stream_stopped
    media?: { title?: string; year?: number | null };
  };
}

type WebhookReq = FastifyRequest<{
  Params: { secret?: string };
  Querystring: { instance?: string };
}>;

export async function tracearrWebhook(app: FastifyInstance): Promise<void> {
  const handler = async (request: WebhookReq, reply: FastifyReply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as TracearrWebhookPayload;
    recordWebhook("tracearr", payload);

    // Optional ?instance=<uuid> attribution. For Tracearr this matters more
    // than for other services: the notification toggles live per-instance
    // (Tracearr has no global category rows), so the per-instance override only
    // applies when `data.instanceId` is set — i.e. when the user appended the
    // instance id to the webhook URL. Without it, the global default applies.
    const inst = resolveWebhookInstance(request, "tracearr");
    const prefix = webhookTitlePrefix(inst, "tracearr");
    const ns = inst ? inst.id : "any";
    const data = payload.data ?? {};

    const who = data.user?.displayName ?? data.user?.username ?? "Someone";

    switch (payload.event) {
      case "test":
        await dispatchPush({
          category: "tracearrViolation",
          title: `${prefix}Tracearr webhook connected`,
          body: data.message ?? "Test notification received successfully",
          bypassCategory: true,
        });
        return { ok: true, test: true };

      case "violation_detected": {
        const rule = data.rule?.name ?? "rule";
        const sev = data.violation?.severity;
        await dispatchPush({
          category: "tracearrViolation",
          title: `${prefix}Rule violation`,
          body: sev ? `${who} — ${rule} (${sev})` : `${who} — ${rule}`,
          data: {
            type: "tracearr",
            event: "violation_detected",
            violationId: data.violation?.id,
            instanceId: inst?.id,
          },
          dedupeKey: `tracearr:${ns}:violation:${data.violation?.id ?? who}`,
        });
        break;
      }

      case "new_device": {
        const name = data.userName ?? who;
        const device = data.deviceName ?? "a new device";
        const loc = data.location ? ` (${data.location})` : "";
        await dispatchPush({
          category: "tracearrNewDevice",
          title: `${prefix}New device`,
          body: `${name} signed in from ${device}${loc}`,
          data: { type: "tracearr", event: "new_device", instanceId: inst?.id },
          // No stable id in the payload — dedupe is best-effort on user+device.
          dedupeKey: `tracearr:${ns}:device:${name}:${device}`,
        });
        break;
      }

      case "trust_score_changed": {
        const name = data.userName ?? who;
        const reason = data.reason ? ` (${data.reason})` : "";
        await dispatchPush({
          category: "tracearrTrustScore",
          title: `${prefix}Trust score changed`,
          body: `${name}: ${data.previousScore} → ${data.newScore}${reason}`,
          data: {
            type: "tracearr",
            event: "trust_score_changed",
            instanceId: inst?.id,
          },
          // Best-effort: key on the new score so a later change isn't collapsed.
          dedupeKey: `tracearr:${ns}:trust:${name}:${data.newScore}`,
        });
        break;
      }

      case "server_down": {
        const server = data.serverName ?? "A server";
        await dispatchPush({
          category: "tracearrServerDown",
          title: `${prefix}Server offline`,
          body: `${server} is offline`,
          data: { type: "tracearr", event: "server_down", instanceId: inst?.id },
          dedupeKey: `tracearr:${ns}:server:${server}:down`,
        });
        break;
      }

      case "server_up": {
        const server = data.serverName ?? "A server";
        await dispatchPush({
          category: "tracearrServerUp",
          title: `${prefix}Server back online`,
          body: `${server} is back online`,
          data: { type: "tracearr", event: "server_up", instanceId: inst?.id },
          dedupeKey: `tracearr:${ns}:server:${server}:up`,
        });
        break;
      }

      case "stream_started": {
        const title = data.media?.title ?? "something";
        await dispatchPush({
          category: "tracearrStreamStarted",
          title: `${prefix}Stream started`,
          body: `${who} started ${title}`,
          data: {
            type: "tracearr",
            event: "stream_started",
            instanceId: inst?.id,
          },
          // No session id in the webhook payload — dedupe is best-effort.
          dedupeKey: `tracearr:${ns}:stream:start:${who}:${title}`,
        });
        break;
      }

      case "stream_stopped": {
        const title = data.media?.title ?? "something";
        await dispatchPush({
          category: "tracearrStreamStopped",
          title: `${prefix}Stream stopped`,
          body: `${who} stopped ${title}`,
          data: {
            type: "tracearr",
            event: "stream_stopped",
            instanceId: inst?.id,
          },
          dedupeKey: `tracearr:${ns}:stream:stop:${who}:${title}`,
        });
        break;
      }

      // Unknown / unmapped event — already recorded above. Don't 4xx: Tracearr
      // won't retry on a 4xx and we'd drop a future event type silently.
      default:
        break;
    }

    return { ok: true };
  };

  // Preferred form (header secret) — registered for symmetry, though Tracearr
  // can't send a custom header so users will use the path form below.
  app.post<{ Params: { secret?: string }; Querystring: { instance?: string } }>(
    "/webhooks/tracearr",
    handler,
  );
  // Path-secret form — what Tracearr's JSON webhook actually uses.
  app.post<{ Params: { secret?: string }; Querystring: { instance?: string } }>(
    "/webhooks/tracearr/:secret",
    handler,
  );
}
