import { useState } from "react";
import { Pressable } from "react-native";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useDelugeSpeedLimits } from "@/hooks/use-deluge";
import { DelugeSpeedLimitsSheet } from "@/components/deluge/speed-limits-sheet";

// Self-contained speed-limits header control for Deluge: a button that opens
// the global-limits sheet. Deluge has no turtle mode, so — like the rtorrent
// control — the button's amber "active" tint keys purely on whether a global
// limit is set. A NEGATIVE value is Deluge's unlimited sentinel; 0 is a real
// (total) throttle, so `> 0` alone would miss it.
export function DelugeSpeedLimitsControl() {
  const [open, setOpen] = useState(false);
  const { data: limits } = useDelugeSpeedLimits();
  const limited =
    !!limits && (limits.maxDownload >= 0 || limits.maxUpload >= 0);

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
      <DelugeSpeedLimitsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
