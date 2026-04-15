import { useState } from "react";
import { Zap } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sendWakeOnLan, WakeOnLanError } from "@/lib/wake-on-lan";
import type { WakeOnLanDevice } from "@/store/config-store";

interface WakeOnLanButtonProps {
  device: WakeOnLanDevice;
  variant?: "primary" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function WakeOnLanButton({
  device,
  variant = "outline",
  size = "md",
  className,
}: WakeOnLanButtonProps) {
  const [sending, setSending] = useState(false);

  const handleWake = async () => {
    setSending(true);
    try {
      await sendWakeOnLan({
        mac: device.mac,
        broadcastAddress: device.broadcastAddress,
        port: device.port,
      });
      toast(`Magic packet sent to ${device.name}`, "success");
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
      label={`Wake ${device.name}`}
      onPress={handleWake}
      variant={variant}
      size={size}
      loading={sending}
      icon={<Zap size={14} color={variant === "primary" ? "#fff" : "#a1a1aa"} />}
      className={className}
    />
  );
}
