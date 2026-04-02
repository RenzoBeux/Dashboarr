import * as Haptics from "expo-haptics";

export function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function mediumHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function successHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function errorHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
