import { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { TextInput } from "@/components/ui/text-input";
import { useModalClosed } from "@/hooks/use-modal-closed";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

export interface DurationUnit {
  label: string;
  /** Multiplier from the typed amount to the unit `onSubmit` reports in
   * (seconds for Pi-hole, milliseconds for AdGuard — whatever the caller's
   * API expects). */
  value: number;
}

interface DurationPromptProps {
  visible: boolean;
  /** What the timer disables, e.g. "Blocking" / "Protection" — drives the
   * subtitle and the max-length error copy. */
  subject: string;
  /** In the same unit as `units[].value` and the value `onSubmit` reports. */
  maxValue: number;
  units: readonly DurationUnit[];
  onSubmit: (value: number) => void;
  onCancel: () => void;
  /** Fired once the modal is fully dismissed — wired by useModalFlow. */
  onClosed?: () => void;
}

/**
 * "Disable [subject] for a custom length of time" — shared by Pi-hole and
 * AdGuard Home's disable flows. They differ only in their duration unit
 * (seconds vs milliseconds) and cap, both parameterized here rather than
 * forked into two near-identical components.
 *
 * Keyboard pattern: centered card with KeyboardAwareScrollView as the modal
 * ROOT, copied from components/common/passphrase-prompt.tsx. That is the
 * repo's existing "flow step with a text input" solution — it cannot clip the
 * way a plain KeyboardAvoidingView can, and it is already flow.bind-compatible.
 */
export function DurationPrompt({
  visible,
  subject,
  maxValue,
  units,
  onSubmit,
  onCancel,
  onClosed,
}: DurationPromptProps) {
  const [amount, setAmount] = useState("");
  const [unitValue, setUnitValue] = useState<number>(units[0]!.value);
  const [error, setError] = useState<string | null>(null);
  const handleDismiss = useModalClosed(visible, onClosed);

  useEffect(() => {
    if (visible) {
      setAmount("");
      setUnitValue(units[0]!.value);
      setError(null);
    }
  }, [visible, units]);

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
    const value = parsed * unitValue;
    if (value > maxValue) {
      setError("Maximum is 7 days");
      return;
    }
    onSubmit(value);
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
            {subject} resumes automatically when the timer ends.
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
            {units.map((unit) => (
              <FilterChip
                key={unit.label}
                label={unit.label}
                selected={unitValue === unit.value}
                onPress={() => setUnitValue(unit.value)}
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
