import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

interface SheetHeaderProps {
  title: string;
  onClose: () => void;
}

// SafeAreaView only applies the top inset when the rendered area actually
// overlaps the unsafe region — so it's a no-op for iOS pageSheet modals (the
// card starts below the status bar) and pads correctly when an Android modal
// inherits a translucent status bar from a parent sheet.
export function SheetHeader({ title, onClose }: SheetHeaderProps) {
  return (
    <SafeAreaView edges={["top"]} className="border-b border-border">
      <View className="flex-row items-center justify-between px-4 py-4">
        <Text className="text-zinc-100 text-lg font-semibold">{title}</Text>
        <Pressable onPress={onClose} className="p-1 active:opacity-70" hitSlop={8}>
          <X size={22} color="#a1a1aa" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
