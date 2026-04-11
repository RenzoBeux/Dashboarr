import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  Download,
  Film,
  Tv,
  Inbox,
  BarChart3,
  Search,
  PlayCircle,
  Server,
  Captions,
} from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { WakeOnLanButton } from "@/components/common/wake-on-lan-button";
import { useConfigStore } from "@/store/config-store";
import { useServiceHealth } from "@/hooks/use-service-health";
import { SERVICE_IDS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";

const SERVICE_ICONS: Record<ServiceId, React.ElementType> = {
  qbittorrent: Download,
  radarr: Film,
  sonarr: Tv,
  overseerr: Inbox,
  tautulli: BarChart3,
  prowlarr: Search,
  plex: PlayCircle,
  glances: Server,
  bazarr: Captions,
};

const SERVICE_ROUTES: Partial<Record<ServiceId, string>> = {
  qbittorrent: "/(tabs)/downloads",
  radarr: "/(tabs)/movies",
  sonarr: "/(tabs)/tv",
  overseerr: "/(tabs)/requests",
  tautulli: "/(tabs)/activity",
  prowlarr: "/(tabs)/indexers",
  plex: "/(tabs)/plex",
  glances: "/(tabs)/glances",
  bazarr: "/(tabs)/bazarr",
};

export default function ServicesScreen() {
  const router = useRouter();
  const services = useConfigStore((s) => s.services);
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
      <Text className="text-zinc-100 text-2xl font-bold mb-4">Services</Text>
      <View className="flex-row flex-wrap gap-3">
        {enabledServices.map((id) => {
          const Icon = SERVICE_ICONS[id];
          const service = services[id];
          const status = health?.find((h) => h.id === id);
          const online = status?.online ?? false;

          return (
            <Pressable
              key={id}
              onPress={() => router.push(SERVICE_ROUTES[id]! as any)}
              className="w-[48%] bg-surface border border-border rounded-2xl p-4 items-center gap-3 active:opacity-70"
            >
              <View className="relative">
                <View className="bg-surface-light rounded-xl p-3">
                  <Icon size={28} color="#a1a1aa" />
                </View>
                <View
                  className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${
                    online ? "bg-success" : "bg-danger"
                  }`}
                />
              </View>
              <Text className="text-zinc-100 text-sm font-medium">{service.name}</Text>
              {!online && service.wakeOnLan?.mac && (
                <WakeOnLanButton serviceId={id} variant="outline" size="sm" />
              )}
            </Pressable>
          );
        })}
      </View>
    </ScreenWrapper>
  );
}
