import * as Haptics from "expo-haptics";
import { useConfigStore } from "@/store/config-store";

function enabled() {
  return useConfigStore.getState().hapticsEnabled;
}

export function lightHaptic() {
  if (!enabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function mediumHaptic() {
  if (!enabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function successHaptic() {
  if (!enabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function errorHaptic() {
  if (!enabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
