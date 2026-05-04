import { Pressable, Text, View } from "react-native";
import { ArrowUpDown } from "lucide-react-native";

interface SortButtonProps {
  onPress: () => void;
  active: boolean;
}

export function SortButton({ onPress, active }: SortButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full active:opacity-70 ${
        active ? "bg-primary/15" : "bg-surface-light"
      }`}
    >
      <ArrowUpDown size={14} color={active ? "#3b82f6" : "#a1a1aa"} />
      <Text
        className={`text-sm font-medium ${
          active ? "text-primary" : "text-zinc-400"
        }`}
      >
        Sort
      </Text>
      {active && <View className="w-1.5 h-1.5 rounded-full bg-primary" />}
    </Pressable>
  );
}
