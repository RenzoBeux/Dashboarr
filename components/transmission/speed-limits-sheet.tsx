import { useEffect, useState } from "react";
import { Modal, View, Text, ActivityIndicator, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Zap, ArrowDown, ArrowUp } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { toast, toastError } from "@/components/ui/toast";
import {
  useTransmissionSession,
  useSetTransmissionSession,
} from "@/hooks/use-transmission";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

interface SpeedLimitsSheetProps {
  visible: boolean;
  onClose: () => void;
}

// Transmission's speed-limit RPC fields are already kB/s (kB = 1000 bytes), so
// the sheet reads/writes the session in kB/s directly — no byte conversion. A
// blank/0 global field disables that limit (sets *-enabled false); a positive
// value enables it. Alt (turtle) limits have no enable flag — they apply
// whenever turtle mode is on.
function kbToStr(kb: number, enabled: boolean): string {
  if (!enabled || !kb) return "";
  return String(Math.round(kb));
}

function parseKb(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function TransmissionSpeedLimitsSheet({ visible, onClose }: SpeedLimitsSheetProps) {
  const session = useTransmissionSession();
  const setSession = useSetTransmissionSession();

  const [dl, setDl] = useState("");
  const [up, setUp] = useState("");
  const [altDl, setAltDl] = useState("");
  const [altUp, setAltUp] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seed inputs from the server when the sheet opens (or the session reloads).
  useEffect(() => {
    if (!visible || !session.data) return;
    const s = session.data;
    setDl(kbToStr(s.speedLimitDown, s.speedLimitDownEnabled));
    setUp(kbToStr(s.speedLimitUp, s.speedLimitUpEnabled));
    setAltDl(s.altSpeedDown ? String(s.altSpeedDown) : "");
    setAltUp(s.altSpeedUp ? String(s.altSpeedUp) : "");
    setError(null);
  }, [visible, session.data]);

  const turtleOn = session.data?.altSpeedEnabled ?? false;

  const handleSave = async () => {
    const dlKb = parseKb(dl);
    const upKb = parseKb(up);
    const altDlKb = parseKb(altDl);
    const altUpKb = parseKb(altUp);
    if (dlKb === null || upKb === null || altDlKb === null || altUpKb === null) {
      setError("Limits must be 0 or a positive number (kB/s)");
      return;
    }
    setError(null);

    try {
      await setSession.mutateAsync({
        speedLimitDown: dlKb,
        speedLimitDownEnabled: dlKb > 0,
        speedLimitUp: upKb,
        speedLimitUpEnabled: upKb > 0,
        altSpeedDown: altDlKb,
        altSpeedUp: altUpKb,
      });
      toast("Speed limits saved", "success");
      onClose();
    } catch (err) {
      toastError("Failed to save speed limits", err);
    }
  };

  const isLoading = session.isLoading;

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
          <Card className="mb-4">
            <Toggle
              label="Turtle mode"
              description="Throttle to the alternative limits below."
              value={turtleOn}
              onValueChange={(next) =>
                setSession.mutate({ altSpeedEnabled: next })
              }
              disabled={setSession.isPending || session.isLoading}
            />
          </Card>

          {isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator color="#3b82f6" />
            </View>
          ) : session.isError ? (
            <Card>
              <Text className="text-zinc-400 text-sm">
                Couldn&apos;t load current limits.
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
                <Text className="text-zinc-500 text-xs">
                  Applied when turtle mode is off. 0 = unlimited.
                </Text>
                <TextInput
                  label="Download (kB/s)"
                  placeholder="0"
                  value={dl}
                  onChangeText={setDl}
                  keyboardType="numeric"
                />
                <TextInput
                  label="Upload (kB/s)"
                  placeholder="0"
                  value={up}
                  onChangeText={setUp}
                  keyboardType="numeric"
                />
              </Card>

              <Card className="mb-4 gap-3">
                <View className="flex-row items-center gap-2">
                  <Icon icon={Zap} size={16} color="#f59e0b" />
                  <Text className="text-zinc-300 text-sm font-semibold">
                    Turtle limits
                  </Text>
                </View>
                <Text className="text-zinc-500 text-xs">
                  Used while turtle mode is on. 0 = unlimited.
                </Text>
                <TextInput
                  label="Turtle download (kB/s)"
                  placeholder="0"
                  value={altDl}
                  onChangeText={setAltDl}
                  keyboardType="numeric"
                />
                <TextInput
                  label="Turtle upload (kB/s)"
                  placeholder="0"
                  value={altUp}
                  onChangeText={setAltUp}
                  keyboardType="numeric"
                />
              </Card>

              {error && <Text className="text-danger text-sm mb-3">{error}</Text>}

              <Button
                label="Save Limits"
                onPress={handleSave}
                loading={setSession.isPending}
              />
            </>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
