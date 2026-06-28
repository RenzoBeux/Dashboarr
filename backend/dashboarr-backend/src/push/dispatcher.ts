import { listActiveDevices } from "../db/repos/devices.js";
import { loadNotificationSettings } from "../db/repos/config.js";
import { claimEvent } from "../db/repos/seen-state.js";
import { sendExpoPush } from "./expo.js";
import { sendApprise } from "./apprise.js";
import type { ExpoPushMessage } from "./expo.js";
import type { PushEvent } from "../types.js";

/**
 * Fan a single event out to every paired (non-invalid) device, respecting the
 * user's per-category notification toggles AND any per-instance overrides
 * (v21+). Dedupe via `dedupeKey` when set.
 *
 * Resolution order for an event with `data.instanceId` set:
 *   1. master `enabled` off → skip (unless bypassCategory for "send test push")
 *   2. per-instance override for this (instanceId, category) → use it
 *   3. global category toggle → fall through
 */
export async function dispatchPush(event: PushEvent): Promise<void> {
  const settings = loadNotificationSettings();
  if (!settings.enabled) return;
  if (!event.bypassCategory) {
    const instanceId =
      typeof event.data?.instanceId === "string" ? event.data.instanceId : undefined;
    const override =
      instanceId !== undefined
        ? settings.perInstance?.[instanceId]?.[event.category]
        : undefined;
    if (override !== undefined) {
      if (override === false) return;
    } else if (settings[event.category] === false) {
      return;
    }
  }

  if (event.dedupeKey) {
    const isFirst = claimEvent(`event:${event.dedupeKey}`);
    if (!isFirst) return;
  }

  // Expo push sink — fan out to every paired device, if any. Skipped (but the
  // Apprise sink below still runs) when no device is paired.
  const devices = listActiveDevices();
  if (devices.length > 0) {
    const messages: ExpoPushMessage[] = devices.map((device) => ({
      to: device.expoPushToken,
      title: event.title,
      body: event.body,
      data: {
        ...(event.data ?? {}),
        category: event.category,
      },
      sound: "default",
      channelId: "dashboarr-default",
      priority: "high",
    }));
    await sendExpoPush(messages);
  }

  // Apprise sink (issue #220) — independent of Expo. Truly fire-and-forget: we
  // deliberately do NOT await it, so a flaky/black-holed Apprise server (e.g. a
  // wrong LAN IP that drops packets, hanging the full 10s timeout) never delays
  // the dispatcher. That matters because every caller awaits dispatchPush — the
  // webhook handlers return their HTTP reply after it, and the poller transition
  // loop awaits it per item — so blocking here would stall those paths. Errors
  // are swallowed + logged via .catch (never retried; see the dedupe note above).
  const apprise = settings.apprise;
  if (apprise?.enabled && apprise.url) {
    void sendApprise(apprise, { title: event.title, body: event.body }).catch(
      (err) => console.warn("[apprise] send failed:", err),
    );
  }
}
