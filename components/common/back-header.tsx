import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

interface BackHeaderProps {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
}

export function BackHeader({ title, right, onBack }: BackHeaderProps) {
  const router = useRouter();
  const handlePress = onBack ?? (() => router.back());

  return (
    <View className="flex-row items-center mb-4 mt-2">
      <Pressable
        onPress={handlePress}
        className="mr-3 active:opacity-70 p-1"
        hitSlop={8}
      >
        <Icon icon={ArrowLeft} size={22} color="#e4e4e7" />
      </Pressable>
      {title ? (
        <Text
          className="text-zinc-100 text-xl font-bold flex-1"
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : (
        <View className="flex-1" />
      )}
      {right}
    </View>
  );
}
