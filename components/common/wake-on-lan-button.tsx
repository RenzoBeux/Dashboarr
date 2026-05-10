import { useState } from "react";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import { sendWakeOnLan } from "@/lib/wake-on-lan";
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
      toastError("Failed to send magic packet", err);
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
      icon={<Icon icon={Zap} size={14} color={variant === "primary" ? "#fff" : "#a1a1aa"} />}
      className={className}
    />
  );
}
