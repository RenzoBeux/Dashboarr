import { View, Text, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import {
  Download,
  Film,
  Tv,
  Inbox,
  BarChart3,
  Search,
  PlayCircle,
  Captions,
} from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useServiceHealth } from "@/hooks/use-service-health";
import { ICON, type ServiceId } from "@/lib/constants";

const SERVICE_ICONS: Partial<Record<ServiceId, React.ElementType>> = {
  qbittorrent: Download,
  radarr: Film,
  sonarr: Tv,
  overseerr: Inbox,
  tautulli: BarChart3,
  prowlarr: Search,
  plex: PlayCircle,
  bazarr: Captions,
};

const SERVICE_ROUTES: Partial<Record<ServiceId, string>> = {
  qbittorrent: "/(tabs)/downloads",
  radarr: "/(tabs)/movies",
  sonarr: "/(tabs)/tv",
};

export function ServiceHealthCard() {
  const { data: services } = useServiceHealth();
  const router = useRouter();

  const enabledServices = services?.filter(
    (s) => s.id in SERVICE_ICONS,
  );

  if (!enabledServices?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
      </CardHeader>
      <View className="flex-row flex-wrap gap-4">
        {enabledServices.map((service) => {
          const Icon = SERVICE_ICONS[service.id as ServiceId];
          const route = SERVICE_ROUTES[service.id as ServiceId];
          if (!Icon) return null;

          return (
            <Pressable
              key={service.id}
              onPress={() => route && router.push(route as any)}
              className="items-center gap-1.5 active:opacity-70"
              hitSlop={6}
            >
              <View className="relative">
                <View className="bg-surface-light rounded-xl p-2.5">
                  <Icon size={ICON.LG} color="#a1a1aa" />
                </View>
                <View
                  className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface ${
                    service.online ? "bg-success" : "bg-danger"
                  }`}
                  style={Platform.OS === "ios" ? {
                    shadowColor: service.online ? "#22c55e" : "#ef4444",
                    shadowRadius: 6,
                    shadowOpacity: 0.6,
                    shadowOffset: { width: 0, height: 0 },
                  } : undefined}
                />
              </View>
              <Text className="text-zinc-500 text-xs">{service.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
