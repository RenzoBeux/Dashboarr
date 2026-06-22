import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { AlertTriangle, ChevronRight } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { HealthIssuesSheet } from "@/components/services/health-issues-sheet";
import { useArrInstanceHealth } from "@/hooks/use-arr-health";
import { worstSeverity, type ArrHealthServiceId } from "@/services/arr-health";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { lightHaptic } from "@/lib/haptics";

interface HealthIssuesBannerProps {
  serviceId: ArrHealthServiceId;
  // Follows the screen's active instance when omitted.
  instanceId?: string;
  className?: string;
}

// Top-of-screen banner for an *arr service view: when the active instance's
// System > Health has warnings/errors, it shows a tappable summary that opens
// the full issue list (#210). Renders null when there's nothing wrong, so it
// takes no space on a healthy instance.
export function HealthIssuesBanner({
  serviceId,
  instanceId,
  className = "",
}: HealthIssuesBannerProps) {
  const { data } = useArrInstanceHealth(serviceId, instanceId);
  const [open, setOpen] = useState(false);

  const issues = (data ?? []).filter((i) => i.type !== "ok");
  const severity = worstSeverity(issues);
  if (!severity) return null;

  const isError = severity === "error";
  const serviceName = SERVICE_DEFAULTS[serviceId].name;
  const label =
    issues.length === 1 ? "1 health issue" : `${issues.length} health issues`;

  return (
    <>
      <Pressable
        onPress={() => {
          lightHaptic();
          setOpen(true);
        }}
        className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 active:opacity-70 ${
          isError
            ? "border-red-600/40 bg-red-600/10"
            : "border-amber-500/40 bg-amber-500/10"
        } ${className}`}
      >
        <Icon
          icon={AlertTriangle}
          size={16}
          color={isError ? "#f87171" : "#fbbf24"}
        />
        <View className="flex-1">
          <Text
            className={`text-sm font-semibold ${
              isError ? "text-red-300" : "text-amber-200"
            }`}
          >
            {label}
          </Text>
          <Text
            className={`text-xs ${
              isError ? "text-red-200/80" : "text-amber-100/80"
            }`}
          >
            {`Tap to view ${serviceName} System Health`}
          </Text>
        </View>
        <Icon
          icon={ChevronRight}
          size={16}
          color={isError ? "#fca5a5" : "#fcd34d"}
        />
      </Pressable>

      <HealthIssuesSheet
        visible={open}
        serviceName={serviceName}
        instances={[{ instanceId: serviceId, instanceName: serviceName, issues }]}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
