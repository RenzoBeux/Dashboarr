import { useState } from "react";
import { Zap } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sendWakeOnLan, WakeOnLanError } from "@/lib/wake-on-lan";
import { useConfigStore } from "@/store/config-store";
import type { ServiceId } from "@/lib/constants";

interface WakeOnLanButtonProps {
  serviceId: ServiceId;
  variant?: "primary" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function WakeOnLanButton({
  serviceId,
  variant = "outline",
  size = "md",
  className,
}: WakeOnLanButtonProps) {
  const config = useConfigStore((s) => s.services[serviceId]);
  const [sending, setSending] = useState(false);

  if (!config.wakeOnLan?.mac) return null;

  const handleWake = async () => {
    setSending(true);
    try {
      await sendWakeOnLan({
        mac: config.wakeOnLan!.mac,
        broadcastAddress: config.wakeOnLan!.broadcastAddress,
        port: config.wakeOnLan!.port,
      });
      toast(`Magic packet sent to ${config.name}`, "success");
    } catch (err) {
      const msg =
        err instanceof WakeOnLanError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to send magic packet";
      toast(msg, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      label="Wake"
      onPress={handleWake}
      variant={variant}
      size={size}
      loading={sending}
      icon={<Zap size={14} color={variant === "primary" ? "#fff" : "#a1a1aa"} />}
      className={className}
    />
  );
}
