import { useEffect, useState } from "react";
import { Modal, View, Text, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { Fingerprint } from "lucide-react-native";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";

export type PassphraseMode = "export" | "import";

export interface PassphraseResult {
  passphrase: string;
  remember: boolean;
}

const MIN_LENGTH = 8;

interface PassphrasePromptProps {
  visible: boolean;
  mode: PassphraseMode;
  hasRemembered: boolean;
  onSubmit: (result: PassphraseResult) => void;
  /** Called when the user taps "Use saved passphrase". Must trigger the
   *  biometric prompt and return the stored passphrase (or null on cancel). */
  onUseRemembered: () => Promise<string | null>;
  onCancel: () => void;
}

export function PassphrasePrompt({
  visible,
  mode,
  hasRemembered,
  onSubmit,
  onUseRemembered,
  onCancel,
}: PassphrasePromptProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (visible) {
      setPassphrase("");
      setConfirm("");
      setRemember(hasRemembered);
      setError(null);
      setUnlocking(false);
    }
  }, [visible, hasRemembered]);

  const handleSubmit = () => {
    if (passphrase.length < MIN_LENGTH) {
      setError(`Passphrase must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (mode === "export" && passphrase !== confirm) {
      setError("Passphrases do not match");
      return;
    }
    onSubmit({ passphrase, remember });
  };

  const handleUseRemembered = async () => {
    setUnlocking(true);
    try {
      const saved = await onUseRemembered();
      if (saved) {
        // Skip the form entirely — keep `remember` on so the stored value
        // stays in place (saveRememberedPassphrase will no-op on same value).
        onSubmit({ passphrase: saved, remember: true });
      }
    } finally {
      setUnlocking(false);
    }
  };

  const title = mode === "export" ? "Encrypt backup" : "Decrypt backup";
  const helper =
    mode === "export"
      ? "Choose a passphrase to encrypt the backup file. You'll need it to restore. There is no recovery — forget the passphrase and the backup is useless."
      : "Enter the passphrase used when this backup was created.";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-black/70 items-center justify-center px-6"
      >
        <Card className="w-full max-w-md gap-4">
          <Text className="text-zinc-100 text-lg font-semibold">{title}</Text>
          <Text className="text-zinc-400 text-sm leading-5">{helper}</Text>

          {hasRemembered && (
            <Pressable
              onPress={handleUseRemembered}
              disabled={unlocking}
              className="active:opacity-80"
            >
              <Card className="flex-row items-center justify-center gap-2 bg-primary/15 border border-primary/40">
                <Fingerprint size={18} color="#60a5fa" />
                <Text className="text-primary text-base font-medium">
                  {unlocking ? "Unlocking…" : "Use saved passphrase"}
                </Text>
              </Card>
            </Pressable>
          )}

          <TextInput
            label="Passphrase"
            placeholder="At least 8 characters"
            value={passphrase}
            onChangeText={(v) => {
              setPassphrase(v);
              if (error) setError(null);
            }}
            secureTextEntry
            autoFocus={!hasRemembered}
          />

          {mode === "export" && (
            <TextInput
              label="Confirm passphrase"
              placeholder="Retype the same passphrase"
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v);
                if (error) setError(null);
              }}
              secureTextEntry
            />
          )}

          <Toggle
            label="Remember on this device"
            description="Unlock with biometrics / device passcode next time. Migration to a new phone still requires the passphrase."
            value={remember}
            onValueChange={setRemember}
          />

          {error && <Text className="text-danger text-xs">{error}</Text>}

          <View className="flex-row gap-3 mt-2">
            <Button label="Cancel" variant="outline" onPress={onCancel} className="flex-1" />
            <Button
              label={mode === "export" ? "Encrypt" : "Decrypt"}
              onPress={handleSubmit}
              className="flex-1"
            />
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}
