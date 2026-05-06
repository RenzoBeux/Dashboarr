import { View } from "react-native";
import { Toggle } from "@/components/ui/toggle";

interface SettingsToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SettingsToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: SettingsToggleRowProps) {
  return (
    <View className="px-4 py-1">
      <Toggle
        label={label}
        description={description}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </View>
  );
}
