import { useState } from "react";
import { Pressable } from "react-native";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useNzbgetStatus, useSetNzbgetRate } from "@/hooks/use-nzbget";
import { UsenetSpeedLimitsSheet } from "@/components/usenet/speed-limits-sheet";

// Self-contained speed-limits header control for NZBGet: a Zap button that opens
// the shared usenet speed-limit sheet. Reads the current limit from
// `status.DownloadLimit` (bytes/s) and sets it via the `rate` method (KB/s).
// Mirrors the SABnzbd control / the torrent SpeedLimitsControl convention.
export function NzbgetSpeedLimitsControl() {
  const [open, setOpen] = useState(false);
  const { data: status } = useNzbgetStatus();
  const setRate = useSetNzbgetRate();

  const currentKbps = (status?.DownloadLimit ?? 0) / 1024;
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
        serviceName="NZBGet"
        currentKbps={currentKbps}
        saving={setRate.isPending}
        onSave={(kbps) => setRate.mutateAsync(kbps)}
      />
    </>
  );
}
