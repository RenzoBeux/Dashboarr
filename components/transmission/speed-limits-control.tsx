import { useState } from "react";
import { Pressable } from "react-native";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useTransmissionSession } from "@/hooks/use-transmission";
import { TransmissionSpeedLimitsSheet } from "@/components/transmission/speed-limits-sheet";

// Self-contained speed-limits header control for Transmission: a button that
// opens the global-limits + turtle sheet. The button shows the "active" amber
// tint whenever turtle mode is on OR a global down/up limit is enabled. Mirrors
// the qBittorrent / rtorrent control's slot in the speed-summary row.
export function TransmissionSpeedLimitsControl() {
  const [open, setOpen] = useState(false);
  const { data: session } = useTransmissionSession();
  const limited =
    !!session &&
    (session.altSpeedEnabled ||
      (session.speedLimitDownEnabled && session.speedLimitDown > 0) ||
      (session.speedLimitUpEnabled && session.speedLimitUp > 0));

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        accessibilityLabel="Speed limits"
        className={`w-12 rounded-xl items-center justify-center active:opacity-70 ${
          limited ? "bg-amber-600/20" : "bg-surface-light"
        }`}
      >
        <Icon
          icon={Zap}
          size={20}
          color={limited ? "#f59e0b" : "#a1a1aa"}
          fill={limited ? "#f59e0b" : "transparent"}
        />
      </Pressable>
      <TransmissionSpeedLimitsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
