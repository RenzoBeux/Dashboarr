import { listActiveDevices } from "../db/repos/devices.js";
import { loadNotificationSettings } from "../db/repos/config.js";
import { claimEvent } from "../db/repos/seen-state.js";
import { sendExpoPush } from "./expo.js";
import type { ExpoPushMessage } from "./expo.js";
import type { PushEvent } from "../types.js";

/**
 * Fan a single event out to every paired (non-invalid) device, respecting the
 * user's per-category notification toggles. Dedupe via `dedupeKey` when set.
 */
export async function dispatchPush(event: PushEvent): Promise<void> {
  const settings = loadNotificationSettings();
  if (!settings.enabled) return;
  if (!event.bypassCategory && settings[event.category] === false) return;

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
