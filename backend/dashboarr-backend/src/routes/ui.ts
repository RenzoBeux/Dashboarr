import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { safeEqual } from "../auth/safe-equal.js";
import type { UiSessionStore } from "../auth/ui-session.js";
import { isEncryptionEnabled } from "../crypto/secrets.js";
import { listBackupMeta } from "../db/repos/config-backup.js";
import { listAllDevices } from "../db/repos/devices.js";
import { listRecentWebhookEvents } from "../db/repos/events.js";
import { getStateEntry } from "../db/repos/seen-state.js";
import { listServiceInstances } from "../db/repos/service-instance.js";
import { getEnv } from "../env.js";
import { buildOverview, type HealthState } from "../ui/overview.js";
import type { UiSession } from "../ui/overview-types.js";
import { VERSION } from "../version.js";
import { getScheduler } from "../workers/scheduler.js";

/**
 * Web UI data API — security model
 * -------------------------------------------
 * Authenticated with WEB_UI_PASSWORD, never with a device bearer: the bearer
 * can replace the whole config and fire pushes, and it lives on the phone,
 * which is exactly the thing the operator does not have in hand when they
 * open this page. Login mints an in-memory session token delivered as an
 * httpOnly, SameSite=Strict cookie whose path defaults to the login request's
 * directory (see UI_COOKIE), so nothing outside this API ever sees it and
 * cross-site requests never carry it.
 *
 * Every route in this file is a read (or the login/logout pair). The web
 * editor's writes live in routes/ui-backups.ts and add `requireSameOrigin`
 * (auth/same-origin.ts) on top of the session; any future mutating route
 * under /ui/api must do the same.
 *
 * The password and session store are injected rather than read from
 * `getEnv()` so tests can exercise both the enabled and disabled paths in a
 * single process (getEnv caches on first call).
 */

export const UI_COOKIE = "dashboarr_ui_session";
// No explicit Path on the cookie: per RFC 6265 the browser then defaults it to
// the directory of the request that set it, i.e. `/ui/api` when the backend
// is at the root and `/dashboarr/ui/api` when a reverse proxy mounts it under
// a prefix and strips it. A hardcoded `/ui/api` would never match behind a
// prefix, and the backend cannot know the prefix.
const SESSION_MAX_AGE_S = 24 * 60 * 60;
const RECENT_WEBHOOKS = 50;

export interface UiRouteOptions {
  password: string | undefined;
  sessions: UiSessionStore;
}

const loginSchema = z.object({ password: z.string().min(1).max(1024) });

function noStore(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store");
}

function sessionToken(request: FastifyRequest): string | undefined {
  return request.cookies[UI_COOKIE];
}

export function requireUiSession(opts: UiRouteOptions) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    noStore(reply);
    if (!opts.password) {
      await reply.code(403).send({ error: "ui_disabled" });
      return;
    }
    const token = sessionToken(request);
    if (!token || !opts.sessions.has(token)) {
      await reply.code(401).send({ error: "unauthenticated" });
    }
  };
}

/** POST /ui/api/login — registered in its own tight rate-limit scope. */
export async function uiLoginRoutes(app: FastifyInstance, opts: UiRouteOptions): Promise<void> {
  app.post("/ui/api/login", async (request, reply) => {
    noStore(reply);
    if (!opts.password) {
      return reply.code(403).send({ error: "ui_disabled" });
    }
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }
    if (!safeEqual(parsed.data.password, opts.password)) {
      request.log.warn({ ip: request.ip }, "web UI login failed");
      return reply.code(401).send({ error: "invalid_password" });
    }
    const token = opts.sessions.create();
    reply.setCookie(UI_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: SESSION_MAX_AGE_S,
      // request.protocol honours X-Forwarded-Proto only when TRUST_PROXY is
      // set; behind a TLS proxy without it the cookie is simply not Secure.
      secure: request.protocol === "https",
    });
    return { ok: true };
  });
}

/** Session probe, logout and the overview — the normal-traffic scope. */
export async function uiDataRoutes(app: FastifyInstance, opts: UiRouteOptions): Promise<void> {
  app.get("/ui/api/session", async (request, reply): Promise<UiSession> => {
    noStore(reply);
    const enabled = !!opts.password;
    const token = sessionToken(request);
    return { enabled, authenticated: enabled && !!token && opts.sessions.has(token) };
  });

  app.post("/ui/api/logout", async (request, reply) => {
    noStore(reply);
    const token = sessionToken(request);
    if (token) opts.sessions.revoke(token);
    // Not reply.clearCookie(): that helper forces Path=/, which would not
    // match the login cookie's default path (see UI_COOKIE) and so would
    // leave the stale cookie in the browser. An expired Set-Cookie with the
    // same attributes and no Path replaces it exactly.
    reply.setCookie(UI_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      expires: new Date(0),
      maxAge: 0,
      secure: request.protocol === "https",
    });
    return { ok: true };
  });

  app.get("/ui/api/overview", { preHandler: requireUiSession(opts) }, async () => {
    const env = getEnv();
    return buildOverview({
      version: VERSION,
      uptimeMs: Math.round(process.uptime() * 1000),
      encryptionEnabled: isEncryptionEnabled(),
      publicUrl: env.PUBLIC_URL?.replace(/\/$/, "") ?? null,
      backendUseRemote: env.BACKEND_USE_REMOTE,
      devices: listAllDevices(),
      instances: listServiceInstances(),
      pollers: getScheduler()?.status() ?? [],
      health: (id) => getStateEntry<HealthState>(`health:${id}:online`),
      webhooks: listRecentWebhookEvents(RECENT_WEBHOOKS),
      backups: listBackupMeta(),
      now: Date.now(),
    });
  });
}
