import { View, Text } from "react-native";

interface ServiceHeaderProps {
  name: string;
  online?: boolean;
  className?: string;
}

export function ServiceHeader({ name, online, className = "" }: ServiceHeaderProps) {
  return (
    <View className={`flex-row items-center gap-2 mb-4 mt-2 ${className}`}>
      <Text className="text-zinc-100 text-2xl font-bold">{name}</Text>
      {online !== undefined && (
        <View
          className={`w-2.5 h-2.5 rounded-full ${online ? "bg-success" : "bg-danger"}`}
        />
      )}
    </View>
  );
}
