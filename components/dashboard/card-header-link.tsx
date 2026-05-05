import { View, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { CardHeader, CardTitle } from "@/components/ui/card";

interface CardHeaderLinkProps {
  title: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}

export function CardHeaderLink({
  title,
  onPress,
  trailing,
}: CardHeaderLinkProps) {
  if (!onPress) {
    return (
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {trailing && <View className="flex-row gap-2">{trailing}</View>}
      </CardHeader>
    );
  }

  return (
    <CardHeader>
      <Pressable
        onPress={onPress}
        className="flex-row items-center gap-1 active:opacity-70"
        hitSlop={8}
      >
        <CardTitle>{title}</CardTitle>
        <ChevronRight size={18} color="#a1a1aa" />
      </Pressable>
      {trailing && <View className="flex-row gap-2">{trailing}</View>}
    </CardHeader>
  );
}
