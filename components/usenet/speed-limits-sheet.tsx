import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Zap } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { toast, toastError } from "@/components/ui/toast";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

interface UsenetSpeedLimitsSheetProps {
  visible: boolean;
  onClose: () => void;
  // Client label shown in the sheet copy (e.g. "SABnzbd", "NZBGet").
  serviceName: string;
  // Current limit in KB/s (0 = unlimited). Seeds the input on open.
  currentKbps: number;
  loading?: boolean;
  saving?: boolean;
  onSave: (kbPerSec: number) => Promise<unknown>;
}

// Both usenet clients expose a single download limit in KB/s (0 = unlimited),
// so this sheet is client-agnostic: the caller passes the current value and a
// save handler. One numeric input plus quick presets covering the issue's
// "quick toggle between unlimited and a configured value" request.
const PRESETS: { label: string; kbps: number }[] = [
  { label: "Unlimited", kbps: 0 },
  { label: "1 MB/s", kbps: 1024 },
  { label: "5 MB/s", kbps: 5120 },
  { label: "10 MB/s", kbps: 10240 },
];

function kbpsToInput(kbps: number): string {
  return kbps > 0 ? String(Math.round(kbps)) : "";
}

// "" => 0 (unlimited); reject negatives / non-numbers with null.
function parseKb(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function UsenetSpeedLimitsSheet({
  visible,
  onClose,
  serviceName,
  currentKbps,
  loading = false,
  saving = false,
  onSave,
}: UsenetSpeedLimitsSheetProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollPadding = useSheetBottomPadding(32);

  // Seed the input from the current limit each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setValue(kbpsToInput(currentKbps));
    setError(null);
  }, [visible, currentKbps]);

  const parsed = parseKb(value);

  const handleSave = async () => {
    if (parsed === null) {
      setError("Limit must be 0 or a positive number (KB/s)");
      return;
    }
    setError(null);
    try {
      await onSave(parsed);
      toast("Speed limit saved", "success");
      onClose();
    } catch (err) {
      toastError("Failed to save speed limit", err);
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
        <SheetHeader title="Speed Limit" onClose={onClose} />

        <KeyboardAwareScrollView
          contentContainerClassName="px-4 py-4 pb-8"
          contentContainerStyle={scrollPadding}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          bottomOffset={20}
        >
          {loading ? (
            <View className="items-center py-10">
              <ActivityIndicator color="#3b82f6" />
            </View>
          ) : (
            <Card className="gap-3">
              <View className="flex-row items-center gap-2">
                <Icon icon={Zap} size={16} color="#f59e0b" />
                <Text className="text-zinc-300 text-sm font-semibold">
                  Download limit
                </Text>
              </View>
              <Text className="text-zinc-500 text-xs">
                Throttle {serviceName} downloads. 0 = unlimited.
              </Text>

              <TextInput
                label="Limit (KB/s)"
                placeholder="0"
                value={value}
                onChangeText={setValue}
                keyboardType="numeric"
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {PRESETS.map((preset) => {
                  const active = parsed === preset.kbps;
                  return (
                    <Pressable
                      key={preset.label}
                      onPress={() => {
                        setValue(kbpsToInput(preset.kbps));
                        setError(null);
                      }}
                      className={`px-4 py-2 rounded-full border active:opacity-70 ${
                        active
                          ? "bg-amber-600/20 border-amber-500"
                          : "bg-surface-light border-border"
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          active ? "text-amber-400" : "text-zinc-300"
                        }`}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {error && <Text className="text-danger text-sm">{error}</Text>}

              <Button label="Save Limit" onPress={handleSave} loading={saving} />
            </Card>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
