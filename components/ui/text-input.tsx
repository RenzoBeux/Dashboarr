import { useCallback, useEffect, useRef, useState } from "react";
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

  // iOS New Architecture (Fabric) intermittently fails to PAINT a controlled
  // TextInput's initial non-empty `value` until the field is focused — the
  // "Remote URL blank until you tap it" bug (#149).
  //
  // Root cause (verified in this app's pinned RN 0.81.5 source,
  // React/Fabric/Mounting/ComponentViews/TextInput/RCTTextInputComponentView.mm):
  // the value IS delivered to the native field at mount via
  // -updateState: -> -_setAttributedString:, which assigns
  // `_backedTextInputView.attributedText` (~line 765). But that method issues
  // NO setNeedsLayout / setNeedsDisplay afterwards, and the field's frame is set
  // in a SEPARATE Fabric commit (-updateLayoutMetrics:). Those two commits have
  // no guaranteed ordering on first mount, so the text can be assigned while the
  // field still has a zero/late frame — UIKit stores the glyphs but never paints
  // them. Focusing forces a relayout and the (already-present) text finally
  // shows. It is a RACE: iOS-only, intermittent, and made more likely by living
  // inside the deferred-layout KeyboardAwareScrollView. Whether a given device
  // shows the bug just depends on which commit wins the race.
  //
  // Why the previous setNativeProps({ text }) nudge did NOT fix it: on Fabric
  // setNativeProps is a legacy-bridge no-op for TextInput (RN #47266), and even
  // if it landed, -_setAttributedString: early-returns when the new string
  // equals the current one (~line 760) — it re-asserted the SAME value, but the
  // value was never missing; a relayout was. A one-shot rAF also guessed the
  // timing and lost the race against later re-renders.
  //
  // The fix: the missing piece is a relayout, not the value — so force one by
  // REMOUNTING the native input (bump its React `key`), but only AFTER onLayout
  // confirms the field has a real (non-zero) on-screen frame. On that second
  // mount the value is committed against an already-laid-out, in-window view, so
  // UIKit paints it without focus. We wait for proof of layout instead of
  // guessing a frame (that's what the old fix got wrong), remount at most once
  // per distinct value, stop entirely once the field has been focused (after
  // which iOS paints value changes normally), and never remount mid-edit. The
  // field stays fully controlled (`value` is unchanged), so the
  // normalize-on-blur / Test / Save write-backs keep working. No-op on Android.
  const [remountKey, setRemountKey] = useState(0);
  const hasRealFrame = useRef(false);
  const lastPaintedValue = useRef<string | null>(null);
  const everFocused = useRef(false);

  const repaintIfNeeded = useCallback(() => {
    if (!isIOS) return;
    if (everFocused.current) return; // once focused, iOS paints value changes itself
    if (!hasRealFrame.current) return; // wait until the field has an on-screen size
    if (typeof value !== "string" || value.length === 0) return; // keep placeholder
    if (lastPaintedValue.current === value) return; // already forced a paint for this text
    lastPaintedValue.current = value;
    setRemountKey((k) => k + 1); // remount -> commit value against a laid-out view
  }, [isIOS, value]);

  // Fires for the value present at mount and for any value that arrives or
  // changes before first focus; the frame gate above defers the actual remount
  // until onLayout has reported a real size.
  useEffect(() => {
    repaintIfNeeded();
  }, [repaintIfNeeded]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onLayout?.(e);
      if (isIOS && !hasRealFrame.current && e.nativeEvent.layout.width > 0) {
        hasRealFrame.current = true;
        repaintIfNeeded();
      }
    },
    [isIOS, onLayout, repaintIfNeeded],
  );

  const handleFocus = useCallback<NonNullable<RNTextInputProps["onFocus"]>>(
    (e) => {
      everFocused.current = true;
      onFocus?.(e);
    },
    [onFocus],
  );

  return (
    <View className={containerClassName}>
      {label && (
        <Text className="text-zinc-400 text-sm mb-1.5">{label}</Text>
      )}
      <RNTextInput
        key={isIOS ? remountKey : undefined}
        value={value}
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
