import { markDeviceInvalidByToken } from "../db/repos/devices.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_CHUNK = 100;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  badge?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?:
      | "DeviceNotRegistered"
      | "MessageTooBig"
      | "MessageRateExceeded"
      | "MismatchSenderId"
      | "InvalidCredentials";
    expoPushToken?: string;
  };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[];
  errors?: { code: string; message: string }[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Send Expo push messages. Uses the PUBLIC endpoint with no auth — this works
 * because "Enhanced Security for Push Notifications" is OFF on the project.
 *
 * DO NOT add an access-token header here. Every user runs their own backend;
 * they don't have Renzo's Expo credentials, and they don't need them.
 */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  for (const batch of chunk(messages, MAX_CHUNK)) {
    try {
      // NOTE: do NOT set Accept-Encoding here. Node's native fetch (undici)
      // will negotiate encoding on its own and decompress transparently. If
      // we set it manually we have to decompress ourselves, or res.json() will
      // blow up the whole batch when Expo responds compressed.
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(`[expo-push] HTTP ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }

      const json = (await res.json()) as ExpoPushResponse;

      if (json.errors?.length) {
        for (const err of json.errors) {
          console.warn(`[expo-push] ${err.code}: ${err.message}`);
        }
      }

      const tickets = json.data ?? [];
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "error") {
          const target = batch[idx];
          const reason = ticket.details?.error ?? ticket.message ?? "unknown";
          console.warn(`[expo-push] ticket error (${reason}) for ${target?.to}`);
          if (ticket.details?.error === "DeviceNotRegistered" && target) {
            markDeviceInvalidByToken(target.to);
          }
        }
      });
    } catch (err) {
      console.warn("[expo-push] send failed:", err);
    }
  }
}
