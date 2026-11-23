import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

/**
 * Shown instead of the app while an interrupted restore can be neither
 * finished nor undone: the saved settings and credentials may then come from
 * different configurations, so nothing may load them.
 */
export function RestorePendingScreen({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const retry = () => {
    setBusy(true);
    void onRetry().finally(() => setBusy(false));
  };
  return (
    <View className="flex-1 bg-background items-center justify-center px-6">
      <Icon icon={AlertTriangle} size={48} color="#f59e0b" />
      <Text className="text-zinc-100 text-lg font-bold mt-4 text-center">
        Restore not finished
      </Text>
      <Text className="text-zinc-500 text-sm text-center mt-2 mb-6">
        A backup restore was interrupted and your previous settings could not be
        put back yet. Make sure the device is unlocked and has free storage,
        then try again.
      </Text>
      <Pressable
        onPress={retry}
        disabled={busy}
        className="bg-primary px-6 py-3 rounded-xl active:opacity-80"
      >
        <Text className="text-white font-semibold">{busy ? "Trying..." : "Try Again"}</Text>
      </Pressable>
    </View>
  );
}
