import { View, Text } from "react-native";

type BadgeVariant = "default" | "downloading" | "seeding" | "paused" | "missing" | "wanted" | "warning" | "error" | "success";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-zinc-700",
  downloading: "bg-blue-600",
  seeding: "bg-green-600",
  paused: "bg-yellow-600",
  warning: "bg-yellow-600",
  missing: "bg-red-600",
  wanted: "bg-orange-600",
  error: "bg-red-600",
  success: "bg-green-600",
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  count?: number;
  className?: string;
}

export function Badge({ label, variant = "default", count, className = "" }: BadgeProps) {
  return (
    <View className={`flex-row items-center rounded-full px-2.5 py-0.5 ${VARIANT_CLASSES[variant]} ${className}`}>
      <Text className="text-white text-xs font-medium">{label}</Text>
      {count !== undefined && (
        <View className="bg-white/20 rounded-full ml-1.5 px-1.5 min-w-[18px] items-center">
          <Text className="text-white text-xs font-bold">{count}</Text>
        </View>
      )}
    </View>
  );
}
