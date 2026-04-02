import { TextInput as RNTextInput, View, Text } from "react-native";
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
  return (
    <View className={containerClassName}>
      {label && (
        <Text className="text-zinc-400 text-sm mb-1.5">{label}</Text>
      )}
      <RNTextInput
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
