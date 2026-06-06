import { useCallback, useState } from "react";
import { TextInput as RNTextInput, View, Text, Platform } from "react-native";
import type {
  TextInputProps as RNTextInputProps,
  LayoutChangeEvent,
} from "react-native";

interface TextInputProps extends RNTextInputProps {
  label?: string;
  error?: string;
  containerClassName?: string;
}

export function TextInput({
  label,
  error,
  containerClassName = "",
  className = "",
  value,
  onLayout,
  onFocus,
  ...props
}: TextInputProps) {
  const isIOS = Platform.OS === "ios";

  // iOS New Architecture (Fabric) intermittently renders a controlled
  // TextInput's initial non-empty `value` as BLANK until the field is focused —
  // the "Remote URL blank until you tap it" bug (#149). It is iOS-version
  // dependent (reproduced on iOS 18, not 26) and more likely inside the
  // deferred-layout KeyboardAwareScrollView, which is why it looks intermittent
  // and is hard to reproduce.
  //
  // Proven mechanism (read from this app's pinned RN 0.81.5 Fabric source).
  // When a view is first mounted, RCTMountingManager applies its mutations in a
  // FIXED order within one commit — updateProps, then updateState, then
  // updateLayoutMetrics (RCTMountingManager.mm, the `Insert` case). For
  // TextInput, updateState -> -_setAttributedString: assigns
  // `_backedTextInputView.attributedText` (RCTTextInputComponentView.mm:765)
  // while the backing UITextView still has a ZERO frame; its real frame is only
  // applied by the LATER updateLayoutMetrics call (line 360). UIKit lays the
  // glyphs out against the zero-sized text container and, on the affected iOS
  // builds, never re-lays them out when the frame subsequently grows — the text
  // exists but is never painted. Focusing forces a relayout, so it finally
  // appears.
  //
  // Why prior fixes failed: setNativeProps({ text }) is a no-op for TextInput on
  // Fabric (RN #47266); a one-shot rAF only guessed the timing; and remounting
  // via `key` re-runs the SAME `Insert` path — attributedText is assigned against
  // a fresh zero frame every time — so it structurally cannot fix the race.
  //
  // The fix: keep the non-empty value off the initial mount entirely. On iOS we
  // render the field EMPTY first (empty text against a zero frame is a harmless
  // no-op), then feed it the real `value` only once `onLayout` proves a real
  // on-screen frame. That value now arrives via the `Update` mutation path
  // (RCTMountingManager.mm), whose updateState assigns attributedText against an
  // already-laid-out, in-window UITextView — the path UIKit paints reliably (the
  // same one any mid-screen setState uses). The field stays fully controlled, so
  // normalize-on-blur / Test / Save write-backs are unaffected; after first
  // layout/focus the value always passes through verbatim. No-op on Android.
  const [primed, setPrimed] = useState(false);
  const prime = useCallback(() => setPrimed(true), []);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onLayout?.(e);
      // A real (non-zero width) frame means the next value assignment lands
      // against a valid text container and will paint without needing focus.
      if (isIOS && e.nativeEvent.layout.width > 0) prime();
    },
    [isIOS, onLayout, prime],
  );

  const handleFocus = useCallback<NonNullable<RNTextInputProps["onFocus"]>>(
    (e) => {
      prime(); // safety net for the rare focus-before-layout case
      onFocus?.(e);
    },
    [prime, onFocus],
  );

  // Withhold a non-empty initial value on iOS until the field has a confirmed
  // frame, so it is never assigned against a zero frame. Empty values, undefined
  // (uncontrolled), and Android are untouched; once primed the real value flows
  // through unchanged.
  const displayValue =
    !isIOS || primed || typeof value !== "string" ? value : "";

  return (
    <View className={containerClassName}>
      {label && (
        <Text className="text-zinc-400 text-sm mb-1.5">{label}</Text>
      )}
      <RNTextInput
        value={displayValue}
        onLayout={handleLayout}
        onFocus={handleFocus}
        className={`bg-surface-light border rounded-xl px-4 py-3 text-zinc-100 text-base ${
          error ? "border-danger" : "border-border"
        } ${className}`}
        placeholderTextColor="#71717a"
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
      {error && (
        <Text className="text-danger text-xs mt-1">{error}</Text>
      )}
    </View>
  );
}
