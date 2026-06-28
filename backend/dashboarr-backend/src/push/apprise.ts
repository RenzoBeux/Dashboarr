import type { AppriseConfig } from "../types.js";

const TIMEOUT_MS = 10_000;

/**
 * Send a notification to a user-run Apprise API server (caronc/apprise), issue
 * #220. We use the persistent config-key model: `cfg.url` is the full notify
 * endpoint the user copied from Apprise's own config UI (e.g.
 * http://host:8000/notify/dashboarr), where their service URLs already live.
 * We only POST the message + an optional tag filter — no secrets pass through.
 *
 * Throws on any non-200 response so the test route can surface the real reason.
 * The dispatcher calls this WITHOUT awaiting (fire-and-forget, errors swallowed
 * via .catch) so a flaky Apprise server never blocks push dispatch.
 */
export async function sendApprise(
  cfg: Pick<AppriseConfig, "url" | "tags">,
  event: { title: string; body: string },
): Promise<void> {
  if (!cfg.url) return;

  const tag = cfg.tags?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: event.title,
        body: event.body,
        type: "info",
        format: "text",
        ...(tag ? { tag } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(
      `Apprise request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  // Apprise returns 200 on success. 204 = no config saved under the key in the
  // URL; 424 = a notification failed or no saved URL matched the tag. Map the
  // common cases to clear messages; anything else surfaces the raw status.
  if (res.status === 200) return;
  if (res.status === 204) {
    throw new Error(
      "Apprise returned 204 — no config is saved under that key on the server",
    );
  }
  if (res.status === 424) {
    throw new Error(
      "Apprise returned 424 — delivery failed or no saved URLs matched the tag",
    );
  }
  const text = await res.text().catch(() => "");
  throw new Error(`Apprise HTTP ${res.status}: ${text.slice(0, 200)}`);
}
