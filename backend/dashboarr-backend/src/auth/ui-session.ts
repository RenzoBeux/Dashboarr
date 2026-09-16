import { randomBytes } from "node:crypto";

export const UI_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory session store for the web UI cookie.
 *
 * Tokens are 32 random bytes (~256 bits), so a plain Map lookup is sufficient
 * for the same reason `bearer.ts` uses SQL equality on device secrets. Nothing
 * is persisted: a restart logs everyone out, which is fine for a status page
 * and keeps the schema untouched. Expired entries are swept on every create,
 * and login is rate-limited to 5/min, so the map stays small.
 *
 * A factory rather than a module singleton so tests can build their own.
 */
export interface UiSessionStore {
  create(now?: number): string;
  has(token: string, now?: number): boolean;
  revoke(token: string): void;
}

export function createUiSessionStore(ttlMs: number = UI_SESSION_TTL_MS): UiSessionStore {
  const sessions = new Map<string, number>(); // token -> expiresAt

  function sweep(now: number): void {
    for (const [token, expiresAt] of sessions) {
      if (expiresAt <= now) sessions.delete(token);
    }
  }

  return {
    create(now = Date.now()) {
      sweep(now);
      const token = randomBytes(32).toString("hex");
      sessions.set(token, now + ttlMs);
      return token;
    },
    has(token, now = Date.now()) {
      const expiresAt = sessions.get(token);
      if (expiresAt === undefined) return false;
      if (expiresAt <= now) {
        sessions.delete(token);
        return false;
      }
      return true;
    },
    revoke(token) {
      sessions.delete(token);
    },
  };
}
