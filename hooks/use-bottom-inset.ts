import { Platform } from "react-native";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/**
 * Bottom safe-area inset with an Android fallback for a known upstream bug:
 * on Samsung One UI 7+ with 3-button navigation (S24 family and others),
 * the live insets from useSafeAreaInsets() report bottom = 0 even though the
 * transparent system nav bar is ~48dp tall, so anything sized from the live
 * value draws under the buttons. initialWindowMetrics (captured natively at
 * SafeAreaProvider mount) reports the correct value on those devices.
 *
 * https://github.com/AppAndFlow/react-native-safe-area-context/issues/667
 * https://github.com/react-navigation/react-navigation/issues/12727
 *
 * The live inset stays primary; the fallback only engages on Android when the
 * live value is 0 and the initial metrics disagree. Devices where 0 is
 * legitimate also report 0 in initial metrics, so they are unaffected.
 */
export function resolveBottomInset(
  liveBottom: number,
  initialBottom: number,
  os: string = Platform.OS,
): number {
  if (os !== "android") return liveBottom;
  if (liveBottom > 0) return liveBottom;
  return initialBottom;
}

export function useBottomInset(): number {
  const { bottom } = useSafeAreaInsets();
  return resolveBottomInset(bottom, initialWindowMetrics?.insets.bottom ?? 0);
}

/**
 * Bottom-padding override for the bottom-most element (footer or scroll
 * content) of a full-screen / pageSheet Modal. In SDK 54 every Android Modal
 * window is edge-to-edge: expo-modules-core flips RN's edge-to-edge feature
 * flag, which forces navigationBarTranslucent on ReactModalHostView on every
 * Android version. Fixed pb-* classes therefore leave footers and scroll ends
 * under the transparent system nav bar (worst with 3-button navigation).
 *
 * Returns an inline style on Android (inline paddingBottom wins over the
 * className pb-*) and undefined on iOS, where pageSheet keeps the existing
 * rem-scaled class padding.
 *
 * `extra` is breathing room above the nav bar; match it to the padding the
 * element uses on iOS (e.g. 32 for pb-8 scroll containers, 12 for footers
 * that pair with pt-3).
 */
export function useSheetBottomPadding(
  extra = 12,
): { paddingBottom: number } | undefined {
  const bottom = useBottomInset();
  if (Platform.OS !== "android") return undefined;
  return { paddingBottom: bottom + extra };
}
