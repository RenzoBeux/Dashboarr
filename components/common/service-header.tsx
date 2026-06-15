import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronDown, Server, Check } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { StatusDot } from "@/components/ui/status-dot";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { useActiveInstance } from "@/hooks/use-active-instance";
import { useServiceHealth } from "@/hooks/use-service-health";
import { lightHaptic } from "@/lib/haptics";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";

interface ServiceHeaderProps {
  name: string;
  // Legacy fallback: kind-aggregated online state (true when any instance is
  // reachable). Used only for screens that don't pass `serviceId`. When
  // serviceId is provided the header looks up the *active instance's* own
  // health instead, since "any instance reachable" is misleading on a tab
  // that's currently scoped to one specific instance.
  online?: boolean;
  className?: string;
  // When provided, the header renders an inline instance picker next to the
  // title and uses per-instance health for the status dot.
  serviceId?: ServiceId;
}

export function ServiceHeader({
  name,
  online,
  className = "",
  serviceId,
}: ServiceHeaderProps) {
  return (
    <View className={`flex-row items-center gap-2 mb-4 mt-2 ${className}`}>
      <Text className="text-zinc-100 text-2xl font-bold">{name}</Text>
      {serviceId ? <InstancePickerInline serviceId={serviceId} /> : null}
      {serviceId ? (
        // Per-instance status dot: reflects whichever instance the active
        // picker currently points at, not the kind aggregate. Half-configured
        // or unreachable active instances show red even when a sibling is up.
        <ActiveInstanceStatusDot serviceId={serviceId} fallback={online} />
      ) : online !== undefined ? (
        <StatusDot state={online ? "ok" : "offline"} size="md" shadow />
      ) : null}
    </View>
  );
}

function ActiveInstanceStatusDot({
  serviceId,
  fallback,
}: {
  serviceId: ServiceId;
  fallback: boolean | undefined;
}) {
  const { activeId } = useActiveInstance(serviceId);
  const { data: health } = useServiceHealth();
  const kind = health?.find((s) => s.id === serviceId);
  const instance = kind?.instances.find((i) => i.instanceId === activeId);
  // While health is still loading the kind entry is undefined; once populated
  // a missing instance row (e.g. user just added one and the next poll hasn't
  // run) also returns undefined — both fall back to the prop so the dot
  // doesn't flicker red on first paint.
  const online = instance?.online ?? fallback;
  if (online === undefined) return null;
  return <StatusDot state={online ? "ok" : "offline"} size="md" shadow />;
}

// Inline instance picker: renders nothing for kinds with 0–1 enabled instances,
// otherwise shows `· <active-instance-name> ▾` next to the title and opens a
// bottom sheet with one row per instance on tap.
function InstancePickerInline({ serviceId }: { serviceId: ServiceId }) {
  const { instances, activeId, setActiveId } = useActiveInstance(serviceId);
  const [open, setOpen] = useState(false);

  if (instances.length <= 1) return null;

  const activeName =
    instances.find((i) => i.id === activeId)?.name ?? instances[0]?.name ?? "";

  // Each instance becomes one ActionSheet row. The currently-active instance
  // gets a check icon so the user has a quick visual on what's selected.
  const actions: ActionSheetAction[] = instances.map((inst) => ({
    label: inst.name,
    icon: (
      <Icon
        icon={inst.id === activeId ? Check : Server}
        size={18}
        color={inst.id === activeId ? "#22c55e" : "#a1a1aa"}
      />
    ),
    onPress: () => {
      if (inst.id !== activeId) setActiveId(inst.id);
    },
  }));

  return (
    <>
      <Pressable
        onPress={() => {
          lightHaptic();
          setOpen(true);
        }}
        hitSlop={8}
        className="flex-row items-center gap-1 ml-1 px-2 py-1 -my-1 rounded-md active:bg-surface-light"
      >
        <Text className="text-zinc-500 text-base">·</Text>
        <Text
          className="text-primary text-base font-medium max-w-[10rem]"
          numberOfLines={1}
        >
          {activeName}
        </Text>
        <Icon icon={ChevronDown} size={14} color="#71717a" />
      </Pressable>

      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Switch instance"
        subtitle={SERVICE_DEFAULTS[serviceId].name}
        actions={actions}
      />
    </>
  );
}
