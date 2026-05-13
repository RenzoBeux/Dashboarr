import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, Check, Pencil, Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceLogo } from "@/components/ui/service-logo";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { useConfigStore } from "@/store/config-store";
import { useServiceHealth } from "@/hooks/use-service-health";
import { lightHaptic } from "@/lib/haptics";
import type { ServiceId } from "@/lib/constants";
import { applyServicesOrder } from "@/lib/services-order";
import { SERVICE_ROUTES } from "@/lib/service-routes";

// Spring tuned to feel snappy but visible — too fast and the user can't tell a
// tile moved; too slow and successive taps queue up before the previous one
// settles. ~300ms total motion is the sweet spot.
const REORDER_LAYOUT = LinearTransition.springify().damping(18).stiffness(180).mass(0.7);

export default function ServicesScreen() {
  const router = useRouter();
  const services = useConfigStore((s) => s.services);
  const wolDevices = useConfigStore((s) => s.wolDevices);
  const servicesOrder = useConfigStore((s) => s.servicesOrder);
  const setServicesOrder = useConfigStore((s) => s.setServicesOrder);
  const { data: health } = useServiceHealth();
  const [editing, setEditing] = useState(false);

  const fullOrder = useMemo(() => applyServicesOrder(servicesOrder), [servicesOrder]);
  const enabledServices = useMemo(
    () => fullOrder.filter((id) => services[id].enabled && SERVICE_ROUTES[id]),
    [fullOrder, services],
  );

  // Reorder in the visible-list space: swap `id` with its previous/next
  // visible neighbor. The store keeps the full ordering (including disabled
  // services), so we look up both ids in the full list and swap there — that
  // way disabled rows interleaved between two visible ones don't sabotage the
  // user's tap. Anything outside the swap pair stays put.
  const moveInVisible = (id: ServiceId, direction: "up" | "down") => {
    const visibleIdx = enabledServices.indexOf(id);
    if (visibleIdx === -1) return;
    const target = direction === "up" ? visibleIdx - 1 : visibleIdx + 1;
    if (target < 0 || target >= enabledServices.length) return;
    const otherId = enabledServices[target];
    const a = fullOrder.indexOf(id);
    const b = fullOrder.indexOf(otherId);
    if (a === -1 || b === -1) return;
    const next = [...fullOrder];
    [next[a], next[b]] = [next[b], next[a]];
    lightHaptic();
    setServicesOrder(next);
  };

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

  // Only show the reorder affordance once there's more than one tile to
  // reorder — a single-service install can't be rearranged.
  const canReorder = enabledServices.length > 1;

  return (
    <ScreenWrapper>
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-zinc-100 text-2xl font-bold">Services</Text>
        <View className="flex-row items-center gap-2">
          {canReorder && (
            <Pressable
              onPress={() => setEditing((v) => !v)}
              className={`flex-row items-center gap-1.5 border rounded-xl px-3 py-2 active:opacity-70 ${
                editing
                  ? "bg-primary/15 border-primary"
                  : "bg-surface border-border"
              }`}
            >
              <Icon
                icon={editing ? Check : Pencil}
                size={14}
                color={editing ? "#60a5fa" : "#a1a1aa"}
              />
              <Text className={`text-sm ${editing ? "text-primary" : "text-zinc-300"}`}>
                {editing ? "Done" : "Reorder"}
              </Text>
            </Pressable>
          )}
          {!editing && wolDevices.length > 0 && (
            <Pressable
              onPress={() => router.push("/wake-on-lan")}
              className="flex-row items-center gap-1.5 bg-surface border border-border rounded-xl px-3 py-2 active:opacity-70"
            >
              <Icon icon={Zap} size={14} color="#a1a1aa" />
              <Text className="text-zinc-300 text-sm">Wake</Text>
            </Pressable>
          )}
        </View>
      </View>
      <View className="flex-row flex-wrap gap-3">
        {enabledServices.map((id, idx) => {
          const service = services[id];
          const status = health?.find((h) => h.id === id);
          const online = status?.online ?? false;
          const isFirst = idx === 0;
          const isLast = idx === enabledServices.length - 1;

          // While reordering, suppress the tile's onPress so a tap can't
          // accidentally drop into a service mid-rearrange. The arrows are the
          // only interactive elements on the tile in this mode.
          //
          // The Animated.View wrapper carries the layout transition so when
          // servicesOrder mutates and React re-renders the children in a new
          // order, each tile springs to its new flex position instead of
          // jump-cutting. The width lives on the wrapper (the actual flex
          // child); the Pressable inside fills it.
          return (
            <Animated.View
              key={id}
              layout={REORDER_LAYOUT}
              className="w-[47%]"
            >
            <Pressable
              onPress={
                editing ? undefined : () => router.push(SERVICE_ROUTES[id]! as any)
              }
              className={`bg-surface border rounded-2xl p-4 items-center gap-3 ${
                editing ? "border-primary/40" : "border-border active:opacity-70"
              }`}
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
              {editing && (
                <View className="flex-row items-center justify-between w-full mt-1">
                  <Pressable
                    onPress={() => moveInVisible(id, "up")}
                    disabled={isFirst}
                    hitSlop={6}
                    className="p-2 active:opacity-60"
                    style={{ opacity: isFirst ? 0.3 : 1 }}
                  >
                    <Icon icon={ArrowLeft} size={18} color="#a1a1aa" />
                  </Pressable>
                  <Pressable
                    onPress={() => moveInVisible(id, "down")}
                    disabled={isLast}
                    hitSlop={6}
                    className="p-2 active:opacity-60"
                    style={{ opacity: isLast ? 0.3 : 1 }}
                  >
                    <Icon icon={ArrowRight} size={18} color="#a1a1aa" />
                  </Pressable>
                </View>
              )}
            </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </ScreenWrapper>
  );
}
