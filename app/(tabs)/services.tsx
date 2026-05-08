import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceLogo } from "@/components/ui/service-logo";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { useConfigStore } from "@/store/config-store";
import { useServiceHealth } from "@/hooks/use-service-health";
import { SERVICE_IDS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";

const SERVICE_ROUTES: Partial<Record<ServiceId, string>> = {
  qbittorrent: "/(tabs)/downloads",
  // SAB shares the Downloads tab with qBittorrent via a segmented control,
  // so the services tile lands on the same route.
  sabnzbd: "/(tabs)/downloads",
  radarr: "/(tabs)/movies",
  sonarr: "/(tabs)/tv",
  overseerr: "/(tabs)/requests",
  tautulli: "/(tabs)/activity",
  prowlarr: "/(tabs)/indexers",
  plex: "/(tabs)/plex",
  jellyfin: "/(tabs)/jellyfin",
  glances: "/(tabs)/glances",
  bazarr: "/(tabs)/bazarr",
};

export default function ServicesScreen() {
  const router = useRouter();
  const services = useConfigStore((s) => s.services);
  const wolDevices = useConfigStore((s) => s.wolDevices);
  const { data: health } = useServiceHealth();

  const enabledServices = SERVICE_IDS.filter((id) => services[id].enabled && SERVICE_ROUTES[id]);

  if (!enabledServices.length) {
    return (
      <ScreenWrapper scrollable={false}>
        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-zinc-100 text-lg font-semibold">No services enabled</Text>
          <Text className="text-zinc-500 text-sm text-center">
            Go to Settings to configure your services.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-zinc-100 text-2xl font-bold">Services</Text>
        {wolDevices.length > 0 && (
          <Pressable
            onPress={() => router.push("/wake-on-lan")}
            className="flex-row items-center gap-1.5 bg-surface border border-border rounded-xl px-3 py-2 active:opacity-70"
          >
            <Icon icon={Zap} size={14} color="#a1a1aa" />
            <Text className="text-zinc-300 text-sm">Wake</Text>
          </Pressable>
        )}
      </View>
      <View className="flex-row flex-wrap gap-3">
        {enabledServices.map((id) => {
          const service = services[id];
          const status = health?.find((h) => h.id === id);
          const online = status?.online ?? false;

          return (
            <Pressable
              key={id}
              onPress={() => router.push(SERVICE_ROUTES[id]! as any)}
              className="w-[47%] bg-surface border border-border rounded-2xl p-4 items-center gap-3 active:opacity-70"
            >
              <View className="relative">
                <View className="bg-surface-light rounded-xl p-3">
                  <ServiceLogo id={id} size={28} online={online} />
                </View>
                <View
                  className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${
                    online ? "bg-success" : "bg-danger"
                  }`}
                />
              </View>
              <Text className="text-zinc-100 text-sm font-medium">{service.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScreenWrapper>
  );
}
