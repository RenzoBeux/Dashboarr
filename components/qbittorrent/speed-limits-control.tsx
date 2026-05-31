import { useState } from "react";
import { Pressable } from "react-native";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useSpeedLimitsMode } from "@/hooks/use-qbittorrent";
import { SpeedLimitsSheet } from "@/components/qbittorrent/speed-limits-sheet";

// Self-contained speed-limits header control for qBittorrent: the alt-speed
// ("turtle") toggle button plus its sheet. Owns its own open state and the
// useSpeedLimitsMode hook so the shared TorrentDownloadsView never touches
// qBittorrent-specific speed hooks. Wired into the adapter as
// `SpeedLimitsControl`; rendered as the third element of the speed-summary row.
export function QbittorrentSpeedLimitsControl() {
  const [open, setOpen] = useState(false);
  const { data: altModeOn } = useSpeedLimitsMode();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        accessibilityLabel="Speed limits"
        className={`w-12 rounded-xl items-center justify-center active:opacity-70 ${
          altModeOn ? "bg-amber-600/20" : "bg-surface-light"
        }`}
      >
        <Icon
          icon={Zap}
          size={20}
          color={altModeOn ? "#f59e0b" : "#a1a1aa"}
          fill={altModeOn ? "#f59e0b" : "transparent"}
        />
      </Pressable>
      <SpeedLimitsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
