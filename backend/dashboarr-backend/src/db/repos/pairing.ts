import { randomBytes } from "node:crypto";
import { getDb } from "../client.js";

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PairingRow {
  token: string;
  expires_at: number;
  claimed_at: number | null;
}

export function createPairingToken(): { token: string; expiresAt: number } {
  const token = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  getDb()
    .prepare("INSERT INTO pairing_tokens (token, expires_at, claimed_at) VALUES (?, ?, NULL)")
    .run(token, expiresAt);
  return { token, expiresAt };
}

/**
 * Attempt to claim a pairing token. Returns true on success (atomic CAS).
 * A claimed token cannot be reused.
 */
export function claimPairingToken(token: string): boolean {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `UPDATE pairing_tokens
       SET claimed_at = ?
       WHERE token = ? AND claimed_at IS NULL AND expires_at > ?`,
    )
    .run(now, token, now);
  return result.changes === 1;
}

export function getPairingToken(token: string): PairingRow | null {
  const row = getDb()
    .prepare<[string], PairingRow>("SELECT * FROM pairing_tokens WHERE token = ?")
    .get(token);
  return row ?? null;
}

/**
 * Current unexpired + unclaimed token, if any. Used by /pair HTML so the same
 * QR stays valid across restarts until claimed.
 */
export function getActiveToken(): string | null {
  const row = getDb()
    .prepare<[number], PairingRow>(
      `SELECT * FROM pairing_tokens
       WHERE claimed_at IS NULL AND expires_at > ?
       ORDER BY expires_at DESC
       LIMIT 1`,
    )
    .get(Date.now());
  return row ? row.token : null;
}

export function ensureActiveToken(): { token: string; expiresAt: number } {
  const existing = getActiveToken();
  if (existing) {
    const row = getPairingToken(existing);
    if (row) return { token: existing, expiresAt: row.expires_at };
  }
  return createPairingToken();
}

export function purgeExpiredTokens(): void {
  getDb()
    .prepare("DELETE FROM pairing_tokens WHERE expires_at < ? OR claimed_at IS NOT NULL")
    .run(Date.now() - 24 * 60 * 60 * 1000);
}
