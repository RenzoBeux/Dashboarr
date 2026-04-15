import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Zap, Settings } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { WakeOnLanButton } from "@/components/common/wake-on-lan-button";
import { useConfigStore } from "@/store/config-store";
import { ICON } from "@/lib/constants";

export function WolDevicesCard() {
  const wolDevices = useConfigStore((s) => s.wolDevices);
  const router = useRouter();

  if (!wolDevices.length) return null;

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center justify-between flex-1">
          <CardTitle>Wake-on-LAN</CardTitle>
          <Pressable
            onPress={() => router.push("/wake-on-lan")}
            className="p-1 active:opacity-70"
            hitSlop={6}
          >
            <Settings size={ICON.SM} color="#71717a" />
          </Pressable>
        </View>
      </CardHeader>
      <View className="gap-2">
        {wolDevices.map((device) => (
          <WakeOnLanButton key={device.id} device={device} size="sm" />
        ))}
      </View>
    </Card>
  );
}
