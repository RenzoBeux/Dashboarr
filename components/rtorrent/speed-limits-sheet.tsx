import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, ActivityIndicator, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { toast, toastError } from "@/components/ui/toast";
import {
  useRtorrentGlobalStats,
  useSetRtorrentGlobalLimits,
} from "@/hooks/use-rtorrent";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

interface SpeedLimitsSheetProps {
  visible: boolean;
  onClose: () => void;
}

// rtorrent has no alternative ("turtle") speed mode — just the two global
// limits. Stats carry the current limits in bytes/s (dlLimit/upLimit); we show
// KB/s and convert at the mutation boundary. 0 = unlimited.
const BYTES_PER_KB = 1024;

function bytesPerSecToKbStr(bps: number): string {
  if (!bps) return "";
  return String(Math.round(bps / BYTES_PER_KB));
}

function parseKb(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function RtorrentSpeedLimitsSheet({ visible, onClose }: SpeedLimitsSheetProps) {
  const stats = useRtorrentGlobalStats();
  const setLimits = useSetRtorrentGlobalLimits();

  const [dl, setDl] = useState("");
  const [up, setUp] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Seed the inputs once per open, from the first stats snapshot available.
  // Guarding with a ref (instead of re-seeding on every stats.data change) means
  // a background poll landing mid-edit can't overwrite what the user typed.
  const seeded = useRef(false);

  useEffect(() => {
    if (!visible) {
      seeded.current = false;
      return;
    }
    if (seeded.current || !stats.data) return;
    setDl(bytesPerSecToKbStr(stats.data.dlLimit));
    setUp(bytesPerSecToKbStr(stats.data.upLimit));
    setError(null);
    seeded.current = true;
  }, [visible, stats.data]);

  const handleSave = async () => {
    const dlKb = parseKb(dl);
    const upKb = parseKb(up);
    if (dlKb === null || upKb === null) {
      setError("Limits must be 0 or a positive number (KB/s)");
      return;
    }
    setError(null);
    try {
      await setLimits.mutateAsync({ dl: dlKb * BYTES_PER_KB, up: upKb * BYTES_PER_KB });
      toast("Speed limits saved", "success");
      onClose();
    } catch (err) {
      toastError("Failed to save speed limits", err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Speed Limits" onClose={onClose} />

        <KeyboardAwareScrollView
          contentContainerClassName="px-4 py-4 pb-8"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          bottomOffset={20}
        >
          {stats.isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator color="#3b82f6" />
            </View>
          ) : stats.isError ? (
            <Card>
              <Text className="text-zinc-400 text-sm">
                Couldn't load current limits.
              </Text>
            </Card>
          ) : (
            <>
              <Card className="mb-4 gap-3">
                <View className="flex-row items-center gap-2">
                  <Icon icon={ArrowDown} size={16} color="#3b82f6" />
                  <Icon icon={ArrowUp} size={16} color="#22c55e" />
                  <Text className="text-zinc-300 text-sm font-semibold">
                    Global limits
                  </Text>
                </View>
                <Text className="text-zinc-500 text-xs">0 = unlimited.</Text>
                <TextInput
                  label="Download (KB/s)"
                  placeholder="0"
                  value={dl}
                  onChangeText={setDl}
                  keyboardType="numeric"
                />
                <TextInput
                  label="Upload (KB/s)"
                  placeholder="0"
                  value={up}
                  onChangeText={setUp}
                  keyboardType="numeric"
                />
              </Card>

              {error && <Text className="text-danger text-sm mb-3">{error}</Text>}

              <Button
                label="Save Limits"
                onPress={handleSave}
                loading={setLimits.isPending}
              />
            </>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
