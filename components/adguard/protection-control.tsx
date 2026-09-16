import { ShieldCheck, ShieldOff } from "lucide-react-native";
import { Text, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useCountdown } from "@/hooks/use-countdown";
import { useAdguardStatus } from "@/hooks/use-adguard";
import { useAdguardDisableFlow } from "@/hooks/use-adguard-disable-flow";
import { formatCountdown } from "@/lib/adguard-format";
import { ICON } from "@/lib/constants";

/**
 * Protection state, the live countdown, and the disable/enable control.
 *
 * Unlike Pi-hole's four-value `blocking` enum, AGH's `protection_enabled` is a
 * plain boolean — there is no "failed"/"unknown" state to guard against here.
 *
 * `protection_disabled_duration` is REMAINING MILLISECONDS at the moment AGH
 * answered — useCountdown works in seconds, so this converts at the boundary
 * rather than decrementing a locally-seeded ms timer. A duration of 0 while
 * disabled means "indefinite", not "already expired" — passing 0 straight
 * into useCountdown would fire onExpire immediately and refetch in a loop.
 */
export function ProtectionControl({ instanceId }: { instanceId?: string }) {
  const { data, isLoading, dataUpdatedAt, refetch } = useAdguardStatus(instanceId);
  const flow = useAdguardDisableFlow(instanceId);

  const isEnabled = data?.protection_enabled ?? true;
  const durationMs = data?.protection_disabled_duration ?? 0;
  const hasTimer = !isEnabled && durationMs > 0;

  // At zero, refetch rather than flipping local state: the server re-enables
  // on its own schedule and may be a moment behind us.
  const remainingSeconds = useCountdown(
    hasTimer ? durationMs / 1000 : null,
    dataUpdatedAt,
    () => {
      void refetch();
    },
  );

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Protection</CardTitle>
        </CardHeader>
        <SkeletonCardContent rows={2} />
      </Card>
    );
  }

  // Indirect lucide component — must still go through <Icon>, and the local
  // must not be named `Icon` (CLAUDE.md).
  const StateIcon = isEnabled ? ShieldCheck : ShieldOff;
  const iconColor = isEnabled ? "#22c55e" : "#ef4444";

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={StateIcon} size={ICON.MD} color={iconColor} />
          <CardTitle>Protection</CardTitle>
        </View>
        <Badge
          label={isEnabled ? "Enabled" : "Disabled"}
          variant={isEnabled ? "success" : "error"}
        />
      </CardHeader>

      <View className="gap-3">
        {!isEnabled ? (
          <View>
            {remainingSeconds !== null ? (
              <>
                <Text className="text-zinc-100 text-2xl font-bold">
                  {formatCountdown(remainingSeconds * 1000)}
                </Text>
                <Text className="text-zinc-500 text-xs">until protection resumes</Text>
              </>
            ) : (
              // duration === 0 while disabled is a PERMANENT disable, not a
              // countdown that reached zero.
              <Text className="text-zinc-400 text-sm">
                Protection is off until you turn it back on.
              </Text>
            )}
          </View>
        ) : (
          <Text className="text-zinc-400 text-sm">
            AdGuard Home is filtering DNS for your network.
          </Text>
        )}

        {/* Mutually exclusive, so re-enabling is always one tap on the card's
            primary button — never behind the duration sheet. */}
        {!isEnabled ? (
          <Button label="Enable protection" onPress={flow.enableNow} loading={flow.isPending} />
        ) : (
          <Button
            label="Disable protection…"
            variant="outline"
            onPress={flow.openDurationSheet}
            loading={flow.isPending}
          />
        )}
      </View>

      {flow.modals}
    </Card>
  );
}
