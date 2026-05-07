import type { ReactNode } from "react";
import type { ComponentType } from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

interface SettingsRowProps {
  icon?: ComponentType<any>;
  leading?: ReactNode;
  label: string;
  subtitle?: string;
  subtitleTone?: "default" | "warn";
  onPress?: () => void;
  right?: ReactNode;
  disabled?: boolean;
}

export function SettingsRow({
  icon,
  leading,
  label,
  subtitle,
  subtitleTone = "default",
  onPress,
  right,
  disabled = false,
}: SettingsRowProps) {
  const subtitleClass =
    subtitleTone === "warn" ? "text-amber-400 text-xs" : "text-zinc-500 text-xs";

  const content = (
    <View
      className={`flex-row items-center px-4 py-3 ${disabled ? "opacity-50" : ""}`}
    >
      {leading ? (
        <View className="bg-surface-light rounded-xl p-2.5 mr-3 items-center justify-center">
          {leading}
        </View>
      ) : icon ? (
        <View className="bg-surface-light rounded-xl p-2.5 mr-3">
          <Icon icon={icon} size={20} color="#a1a1aa" />
        </View>
      ) : null}
      <View className="flex-1">
        <Text className="text-zinc-100 text-base">{label}</Text>
        {subtitle ? <Text className={subtitleClass}>{subtitle}</Text> : null}
      </View>
      {right || onPress ? (
        <View className="flex-row items-center gap-2 ml-2">
          {right}
          {onPress ? <Icon icon={ChevronRight} size={18} color="#71717a" /> : null}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="active:opacity-80"
    >
      {content}
    </Pressable>
  );
}
