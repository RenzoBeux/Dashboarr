import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronRight, ShieldCheck } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceLogo } from "@/components/ui/service-logo";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { HealthIssuesSheet } from "@/components/services/health-issues-sheet";
import {
  useArrHealthSections,
  type ArrInstanceHealth,
} from "@/hooks/use-arr-health";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { lightHaptic } from "@/lib/haptics";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

// Consolidated System > Health view for the *arr stack (issue #210). One row per
// service kind that has warnings/errors; tapping a row opens the full issue list
// (grouped by instance when a kind has more than one). Shows a clean "all
// healthy" state otherwise so the widget is reassuring, not just an alarm.
export function ArrHealthCard({ slotId }: WidgetComponentProps) {
  const { sections, isLoading } = useArrHealthSections();
  const [sheet, setSheet] = useState<{
    serviceName: string;
    instances: ArrInstanceHealth[];
  } | null>(null);

  const totalIssues = sections.reduce((acc, s) => acc + s.count, 0);
  const anyError = sections.some((s) => s.severity === "error");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health Alerts</CardTitle>
        {totalIssues > 0 ? (
          <Badge
            label={`${totalIssues}`}
            variant={anyError ? "error" : "warning"}
          />
        ) : null}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : sections.length === 0 ? (
        <View className="flex-row items-center gap-2 py-1">
          <Icon icon={ShieldCheck} size={18} color="#22c55e" />
          <Text className="text-zinc-400 text-sm">All services healthy</Text>
        </View>
      ) : (
        <View className="gap-2">
          {sections.map((section) => {
            const serviceName = SERVICE_DEFAULTS[section.serviceId].name;
            const preview = section.previewMessage;
            const accent = section.severity === "error" ? "#ef4444" : "#f59e0b";
            // When a kind has issues on more than one instance, hint at the
            // spread; the sheet breaks it down per instance on tap.
            const instanceHint =
              section.instances.length > 1
                ? ` · ${section.instances.length} instances`
                : "";
            return (
              <Pressable
                key={section.serviceId}
                onPress={() => {
                  lightHaptic();
                  setSheet({ serviceName, instances: section.instances });
                }}
                className="flex-row items-center gap-3 rounded-xl bg-surface-light px-3 py-2.5 active:opacity-70"
              >
                <ServiceLogo id={section.serviceId} size={22} />
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-zinc-100 text-sm font-semibold">
                      {serviceName}
                    </Text>
                    <View
                      className="rounded-full px-1.5 py-0.5"
                      style={{ backgroundColor: accent }}
                    >
                      <Text className="text-white text-[0.65rem] font-bold leading-none">
                        {section.count}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                    {preview}
                    {instanceHint ? (
                      <Text className="text-zinc-600">{instanceHint}</Text>
                    ) : null}
                  </Text>
                </View>
                <Icon icon={ChevronRight} size={16} color="#71717a" />
              </Pressable>
            );
          })}
        </View>
      )}

      <HealthIssuesSheet
        visible={!!sheet}
        serviceName={sheet?.serviceName ?? ""}
        instances={sheet?.instances ?? null}
        onClose={() => setSheet(null)}
      />
    </Card>
  );
}
