import { View, Text, Pressable } from "react-native";
import { X } from "lucide-react-native";

interface SheetHeaderProps {
  title: string;
  onClose: () => void;
}

export function SheetHeader({ title, onClose }: SheetHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
      <Text className="text-zinc-100 text-lg font-semibold">{title}</Text>
      <Pressable onPress={onClose} className="p-1 active:opacity-70" hitSlop={8}>
        <X size={22} color="#a1a1aa" />
      </Pressable>
    </View>
  );
}
