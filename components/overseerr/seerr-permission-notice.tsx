import { View, Text } from "react-native";
import { Lock } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

/**
 * Inline "your Seerr account can't do this" notice (#332), rendered in place
 * of an action block the signed-in account lacks the permission for. The
 * Navidrome overview's non-admin notice is the precedent: explain instead of
 * showing a disabled button, and never show a control that would 403.
 */
export function SeerrPermissionNotice({
  message,
  className = "",
}: {
  message: string;
  className?: string;
}) {
  return (
    <View className={`flex-row items-start gap-2 ${className}`}>
      <Icon icon={Lock} size={14} color="#a1a1aa" />
      <Text className="text-zinc-400 text-sm flex-1 leading-5">{message}</Text>
    </View>
  );
}
