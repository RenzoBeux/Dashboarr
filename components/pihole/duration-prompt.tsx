import { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { TextInput } from "@/components/ui/text-input";
import { useModalClosed } from "@/hooks/use-modal-closed";
import { MAX_DISABLE_SECONDS } from "@/lib/pihole-format";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

const UNITS = [
  { label: "Minutes", seconds: 60 },
  { label: "Hours", seconds: 3600 },
  { label: "Days", seconds: 86400 },
] as const;

interface DurationPromptProps {
  visible: boolean;
  onSubmit: (seconds: number) => void;
  onCancel: () => void;
  /** Fired once the modal is fully dismissed — wired by useModalFlow. */
  onClosed?: () => void;
}

/**
 * "Disable blocking for a custom length of time".
 *
 * Keyboard pattern: centered card with KeyboardAwareScrollView as the modal
 * ROOT, copied from components/common/passphrase-prompt.tsx. That is the repo's
 * existing "flow step with a text input" solution — it cannot clip the way a
 * plain KeyboardAvoidingView can, and it is already flow.bind-compatible.
 */
export function DurationPrompt({
  visible,
  onSubmit,
  onCancel,
  onClosed,
}: DurationPromptProps) {
  const [amount, setAmount] = useState("");
  const [unitSeconds, setUnitSeconds] = useState<number>(UNITS[0].seconds);
  const [error, setError] = useState<string | null>(null);
  const handleDismiss = useModalClosed(visible, onClosed);

  useEffect(() => {
    if (visible) {
      setAmount("");
      setUnitSeconds(UNITS[0].seconds);
      setError(null);
    }
  }, [visible]);

  const handleSubmit = () => {
    const trimmed = amount.trim();
    if (!trimmed) {
      setError("Enter a number");
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      setError("Enter a whole number");
      return;
    }
    if (parsed < 1) {
      setError("Must be at least 1");
      return;
    }
    const seconds = parsed * unitSeconds;
    if (seconds > MAX_DISABLE_SECONDS) {
      setError("Maximum is 7 days");
      return;
    }
    onSubmit(seconds);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onDismiss={handleDismiss}
    >
      <KeyboardAwareScrollView
        className="flex-1 bg-black/70"
        contentContainerClassName="flex-grow items-center justify-center px-6 py-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <Card className="w-full max-w-md gap-4">
          <Text className="text-zinc-100 text-lg font-semibold">
            Disable for how long?
          </Text>
          <Text className="text-zinc-400 text-sm leading-5">
            Blocking resumes automatically when the timer ends.
          </Text>

          <TextInput
            label="Duration"
            value={amount}
            onChangeText={(text) => {
              setAmount(text);
              if (error) setError(null);
            }}
            keyboardType="number-pad"
            autoFocus
            placeholder="15"
            error={error ?? undefined}
            onSubmitEditing={handleSubmit}
          />

          {/* Chip rows always live in a horizontal ScrollView: at a higher UI
              scale they grow with rem and would otherwise clip off-screen. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2"
          >
            {UNITS.map((unit) => (
              <FilterChip
                key={unit.label}
                label={unit.label}
                selected={unitSeconds === unit.seconds}
                onPress={() => setUnitSeconds(unit.seconds)}
              />
            ))}
          </ScrollView>

          <View className="flex-row gap-3">
            <Button
              label="Cancel"
              variant="outline"
              onPress={onCancel}
              className="flex-1"
            />
            <Button label="Disable" onPress={handleSubmit} className="flex-1" />
          </View>
        </Card>
      </KeyboardAwareScrollView>
    </Modal>
  );
}
