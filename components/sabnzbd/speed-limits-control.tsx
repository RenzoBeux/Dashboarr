import { useState } from "react";
import { Pressable } from "react-native";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useSabQueue, useSetSabSpeedLimit } from "@/hooks/use-sabnzbd";
import { UsenetSpeedLimitsSheet } from "@/components/usenet/speed-limits-sheet";

// Self-contained speed-limits header control for SABnzbd: a Zap button that
// opens the shared usenet speed-limit sheet. The button shows the amber "active"
// tint whenever a download limit is set. Mirrors the torrent SpeedLimitsControl
// convention — each client owns its own hooks so the shared view stays generic.
// Reads the current absolute limit from the queue's `speedlimit_abs` (bytes/s),
// which shares its cache key with the downloads view's queue poll.
export function SabnzbdSpeedLimitsControl() {
  const [open, setOpen] = useState(false);
  const { data: queue } = useSabQueue();
  const setLimit = useSetSabSpeedLimit();

  const currentKbps = Number(queue?.speedlimit_abs ?? 0) / 1024;
  const limited = currentKbps > 0;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        accessibilityLabel="Speed limit"
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
      <UsenetSpeedLimitsSheet
        visible={open}
        onClose={() => setOpen(false)}
        serviceName="SABnzbd"
        currentKbps={currentKbps}
        saving={setLimit.isPending}
        onSave={(kbps) => setLimit.mutateAsync(kbps)}
      />
    </>
  );
}
