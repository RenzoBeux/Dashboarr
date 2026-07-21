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
