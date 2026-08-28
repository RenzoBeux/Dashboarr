import { RotateCw, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { useCountdown } from "@/hooks/use-countdown";
import { usePiholeBlocking } from "@/hooks/use-pihole";
import { usePiholeDisableFlow } from "@/hooks/use-pihole-disable-flow";
import { formatCountdown } from "@/lib/pihole-format";
import { ICON } from "@/lib/constants";

/**
 * Blocking state, the live countdown, and the disable/enable control.
 *
 * Two things this must never do:
 *
 *   - Render `blocking` as a boolean. FTL returns four values, and a Switch
 *     over them shows "failed" and "unknown" as ON — i.e. it tells the user
 *     blocking is working when Pi-hole itself does not know that.
 *   - Decrement a locally-seeded timer. `timer` is remaining seconds at the
 *     moment FTL answered, so useCountdown anchors it to the query's
 *     dataUpdatedAt instead (see that hook for why).
 */
export function BlockingControl({ instanceId }: { instanceId?: string }) {
  const { data, isLoading, dataUpdatedAt, refetch } = usePiholeBlocking(instanceId);
  const flow = usePiholeDisableFlow(instanceId);

  // At zero, refetch rather than flipping local state: the server re-enables on
  // its own schedule and may be a moment behind us.
  const remaining = useCountdown(data?.timer, dataUpdatedAt, () => {
    void refetch();
  });

  if (isLoading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Blocking</CardTitle>
        </CardHeader>
        <SkeletonCardContent rows={2} />
      </Card>
    );
  }

  const state = data?.blocking ?? "unknown";
  const isEnabled = state === "enabled";
  const isDisabled = state === "disabled";
  // "failed" and "unknown" both mean Pi-hole cannot vouch for the state.
  const isIndeterminate = !isEnabled && !isDisabled;

  // Indirect lucide component — must still go through <Icon>, and the local
  // must not be named `Icon` (CLAUDE.md).
  const StateIcon = isEnabled ? ShieldCheck : isDisabled ? ShieldOff : ShieldAlert;
  const iconColor = isEnabled ? "#22c55e" : isDisabled ? "#ef4444" : "#f59e0b";

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={StateIcon} size={ICON.MD} color={iconColor} />
          <CardTitle>Blocking</CardTitle>
        </View>
        <Badge
          label={isEnabled ? "Enabled" : isDisabled ? "Disabled" : "Unavailable"}
          variant={isEnabled ? "success" : isDisabled ? "error" : "warning"}
        />
      </CardHeader>

      {isIndeterminate ? (
        <View className="gap-3">
          <Text className="text-zinc-400 text-sm leading-5">
            {state === "failed"
              ? "Pi-hole reports its blocking state as failed. Check the Pi-hole itself before changing anything here."
              : "Pi-hole did not report a blocking state."}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            className="flex-row items-center gap-2 active:opacity-70"
          >
            <Icon icon={RotateCw} size={ICON.SM} color="#a1a1aa" />
            <Text className="text-zinc-300 text-sm">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3">
          {isDisabled ? (
            <View>
              {remaining !== null ? (
                <>
                  <Text className="text-zinc-100 text-2xl font-bold">
                    {formatCountdown(remaining)}
                  </Text>
                  <Text className="text-zinc-500 text-xs">
                    until blocking resumes
                  </Text>
                </>
              ) : (
                // timer === null with blocking disabled is a PERMANENT
                // disable, not a countdown that reached zero.
                <Text className="text-zinc-400 text-sm">
                  Blocking is off until you turn it back on.
                </Text>
              )}
            </View>
          ) : (
            <Text className="text-zinc-400 text-sm">
              Pi-hole is filtering DNS for your network.
            </Text>
          )}

          {/* Mutually exclusive, so re-enabling is always one tap on the card's
              primary button — never behind the duration sheet. */}
          {isDisabled ? (
            <Button
              label="Enable blocking"
              onPress={flow.enableNow}
              loading={flow.isPending}
            />
          ) : (
            <Button
              label="Disable blocking…"
              variant="outline"
              onPress={flow.openDurationSheet}
              loading={flow.isPending}
            />
          )}
        </View>
      )}

      {flow.modals}
    </Card>
  );
}
