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

// Sustained multi-pulse "brrr" — bypasses the hapticsEnabled gate so it can
// preview the feature at the moment the user turns it on (the store update
// races with the toggle's own haptic, which is gated and silently no-ops).
export function brrrHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  setTimeout(
    () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    90,
  );
}
