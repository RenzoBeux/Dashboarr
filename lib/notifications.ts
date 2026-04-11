import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const DEFAULT_CHANNEL_ID = "dashboarr-default";

let configured = false;

/**
 * Initialize notification handler, Android channel, and request permissions.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function configureNotifications(): Promise<boolean> {
  if (configured) return true;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
        name: "Dashboarr Alerts",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#3b82f6",
      });
    } catch (err) {
      console.warn("Failed to create notification channel", err);
    }
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    return newStatus === "granted";
  }
  return true;
}

interface LocalNotificationOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Fire a local notification immediately. Falls back silently if permissions aren't granted.
 */
export async function sendLocalNotification(
  options: LocalNotificationOptions,
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data ?? {},
        sound: "default",
      },
      trigger: null,
      identifier: undefined,
    });
  } catch (err) {
    console.warn("Failed to send local notification", err);
  }
}
