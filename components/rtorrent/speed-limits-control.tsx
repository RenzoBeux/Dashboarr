import { useState } from "react";
import { Pressable } from "react-native";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useRtorrentGlobalStats } from "@/hooks/use-rtorrent";
import { RtorrentSpeedLimitsSheet } from "@/components/rtorrent/speed-limits-sheet";

// Self-contained speed-limits header control for rtorrent: a button that opens
// the global-limits sheet. rtorrent has no alt-speed mode, so the button shows
// the "active" amber tint whenever a global down/up limit is set. Mirrors the
// qBittorrent control's slot in the speed-summary row.
export function RtorrentSpeedLimitsControl() {
  const [open, setOpen] = useState(false);
  const { data: stats } = useRtorrentGlobalStats();
  const limited = !!stats && (stats.dlLimit > 0 || stats.upLimit > 0);

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
      <RtorrentSpeedLimitsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
