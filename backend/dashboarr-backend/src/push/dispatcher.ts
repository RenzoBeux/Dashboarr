import { listActiveDevices } from "../db/repos/devices.js";
import { loadNotificationSettings } from "../db/repos/config.js";
import { claimEvent } from "../db/repos/seen-state.js";
import { sendExpoPush } from "./expo.js";
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

  const devices = listActiveDevices();
  if (devices.length === 0) return;

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
