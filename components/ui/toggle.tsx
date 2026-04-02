import { View, Text, Switch } from "react-native";

interface ToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  className = "",
}: ToggleProps) {
  return (
    <View className={`flex-row items-center justify-between py-2 ${className}`}>
      <View className="flex-1 mr-3">
        <Text className="text-zinc-100 text-base">{label}</Text>
        {description && (
          <Text className="text-zinc-500 text-sm mt-0.5">{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: "#3f3f46", true: "#3b82f6" }}
        thumbColor={value ? "#ffffff" : "#a1a1aa"}
      />
    </View>
  );
}
