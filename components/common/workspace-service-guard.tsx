import type { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Layers } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import {
  useAttachedKinds,
  useActiveDashboard,
} from "@/hooks/use-active-dashboard";
import type { ServiceId } from "@/lib/constants";

/**
 * Gates a per-service tab to the active workspace. When NONE of `kinds` has an
 * attached instance on the active dashboard, the screen would otherwise resolve
 * to `instanceId = null` and render generic "No data" / empty content — which
 * reads as "the service is down" rather than "this service isn't part of this
 * workspace" (#8). This shows an explicit not-attached state with a path to the
 * dashboard's settings instead.
 *
 * The guarded screen lives in `children`, so its data hooks only mount when the
 * kind is actually attached — keeping the early-return free of rules-of-hooks
 * issues and avoiding needless work on a workspace that excludes the service.
 */
export function WorkspaceServiceGuard({
  kinds,
  children,
}: {
  kinds: ServiceId[];
  children: ReactNode;
}) {
  const attachedKinds = useAttachedKinds();
  const attached = kinds.some((k) => attachedKinds.has(k));
  if (attached) return <>{children}</>;
  return <NotAttachedState />;
}

function NotAttachedState() {
  const router = useRouter();
  const active = useActiveDashboard();
  return (
    <ScreenWrapper scrollable={false}>
      <View className="flex-1 items-center justify-center px-8 gap-2">
        <View className="w-16 h-16 rounded-2xl bg-surface-light items-center justify-center mb-2">
          <Icon icon={Layers} size={28} color="#71717a" />
        </View>
        <Text className="text-zinc-100 text-lg font-semibold text-center">
          Not attached to this workspace
        </Text>
        <Text className="text-zinc-500 text-sm text-center leading-5">
          This service isn&apos;t part of the current dashboard. Attach it in the
          dashboard&apos;s settings, or switch to a workspace that includes it.
        </Text>
        {active && (
          <Pressable
            onPress={() => router.push(`/dashboard-edit/${active.id}` as any)}
            className="mt-4 rounded-xl bg-surface-light border border-border px-4 py-2.5 active:opacity-70"
          >
            <Text className="text-zinc-200 text-sm font-semibold">
              Dashboard settings
            </Text>
          </Pressable>
        )}
      </View>
    </ScreenWrapper>
  );
}
