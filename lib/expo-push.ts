import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

/**
 * Read the shared EAS projectId from app.config.ts → extra.eas.projectId.
 * All installs share the same projectId, baked in at build time.
 */
function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId;
  if (!projectId || projectId === "00000000-0000-0000-0000-000000000000") {
    return null;
  }
  return projectId;
}

/**
 * Request a real Expo push token for this device. Returns null if permissions
 * are denied, the projectId isn't configured, or we're running in an
 * environment that doesn't support push (Expo Go on SDK 53+, iOS simulator).
 */
export async function getExpoPushToken(): Promise<string | null> {
  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[expo-push] no projectId configured in app.config.ts");
    return null;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") {
      return null;
    }

    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return result.data ?? null;
  } catch (err) {
    console.warn("[expo-push] getExpoPushTokenAsync failed:", err);
    return null;
  }
}

export function hasProjectId(): boolean {
  return getProjectId() !== null;
}
