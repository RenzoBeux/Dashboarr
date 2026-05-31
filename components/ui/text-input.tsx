import { useEffect, useRef } from "react";
import { TextInput as RNTextInput, View, Text, Platform } from "react-native";
import type { TextInputProps as RNTextInputProps } from "react-native";

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
  ...props
}: TextInputProps) {
  const ref = useRef<RNTextInput>(null);
  // Read the freshest value when the post-mount nudge fires.
  const valueRef = useRef(props.value);
  valueRef.current = props.value;

  // iOS New Architecture (Fabric) intermittently fails to paint a controlled
  // TextInput's initial non-empty `value` until the field is focused — the
  // "Remote URL blank until you tap it" bug (#149). Re-assert the text once
  // after the first frame so Fabric repaints it without requiring user focus.
  // We write back the SAME value React already holds, so the input stays
  // controlled and never desyncs from `value`/`onChangeText`. Empty fields are
  // skipped so their placeholder still shows.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const id = requestAnimationFrame(() => {
      const v = valueRef.current;
      if (typeof v === "string" && v.length > 0) {
        ref.current?.setNativeProps({ text: v });
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <View className={containerClassName}>
      {label && (
        <Text className="text-zinc-400 text-sm mb-1.5">{label}</Text>
      )}
      <RNTextInput
        ref={ref}
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
