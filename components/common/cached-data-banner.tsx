import { Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { CloudOff } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useActiveInstance } from "@/hooks/use-active-instance";
import { useServiceHealth } from "@/hooks/use-service-health";
import type { ServiceId } from "@/lib/constants";

/**
 * Banner for a service screen whose active instance is currently unreachable.
 *
 * TanStack Query keeps the last successful `data` on a failed refetch and the
 * app holds it for `gcTime` (5 min, lib/query-client.ts), so the cards keep
 * rendering the last-known values with nothing to signal they're stale — easy
 * to mistake for live data when the server is actually offline (away from home,
 * VPN down, server stopped, …). This makes that state explicit.
 *
 * Keyed on the ACTIVE instance's health `status` (the same signal as the red
 * status dot), so it tracks whichever instance the screen is scoped to. Renders
 * nothing while health is still loading, or when the server answered at all —
 * `ok` and `auth_failed` both mean the data on screen is live, not cached.
 */
export function CachedDataBanner({
  serviceId,
  label,
}: {
  serviceId: ServiceId;
  label?: string;
}) {
  const { activeId } = useActiveInstance(serviceId);
  const { data: health } = useServiceHealth();
  const kind = health?.find((s) => s.id === serviceId);
  const instance = kind?.instances.find((i) => i.instanceId === activeId);
  if (!instance || instance.status !== "offline") return null;

  const name = label ?? instance.instanceName ?? kind?.name ?? "This service";
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      className="flex-row items-center gap-2.5 mb-4 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10"
    >
      <Icon icon={CloudOff} size={16} color="#f59e0b" />
      <Text className="text-amber-300 text-xs flex-1">
        {name} is unreachable — any data shown may be out of date.
      </Text>
    </Animated.View>
  );
}
