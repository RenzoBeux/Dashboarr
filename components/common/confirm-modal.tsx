import type { ComponentType, ReactNode } from "react";
import { Modal, View, Text, KeyboardAvoidingView, Platform } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useModalClosed } from "@/hooks/use-modal-closed";

export type ConfirmTone = "default" | "danger";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string | ReactNode;
  icon?: ComponentType<any>;
  tone?: ConfirmTone;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Fired once the modal is fully dismissed (see `useModalClosed`). Use this to
   * sequence anything that must not run while the modal is still tearing down —
   * e.g. `router.back()`, which hangs the JS thread on iOS/Fabric if it races
   * the dismiss. See `useDeferredBack`.
   */
  onClosed?: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  icon,
  tone = "default",
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  onClosed,
}: ConfirmModalProps) {
  const isDanger = tone === "danger";
  const resolvedConfirmLabel =
    confirmLabel ?? (isDanger ? "Delete" : "Confirm");
  const iconColor = isDanger ? "#ef4444" : "#60a5fa";
  const iconBg = isDanger ? "bg-danger/15" : "bg-primary/15";

  // Fire onClosed once the modal is fully dismissed — the safe point to pop the
  // screen / open another modal on iOS. See useModalClosed.
  const handleDismiss = useModalClosed(visible, onClosed);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
      onDismiss={handleDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-black/70 items-center justify-center px-6"
      >
        <Card className="w-full max-w-md gap-4">
          <View className="flex-row items-center gap-3">
            {icon ? (
              <View className={`${iconBg} rounded-xl p-2.5`}>
                <Icon icon={icon} size={20} color={iconColor} />
              </View>
            ) : null}
            <Text className="text-zinc-100 text-lg font-semibold flex-1">
              {title}
            </Text>
          </View>

          {typeof message === "string" ? (
            <Text className="text-zinc-400 text-sm leading-5">{message}</Text>
          ) : (
            message
          )}

          <View className="flex-row gap-3 mt-2">
            <Button
              label={cancelLabel}
              variant="outline"
              onPress={onCancel}
              className="flex-1"
            />
            <Button
              label={resolvedConfirmLabel}
              variant={isDanger ? "danger" : "primary"}
              onPress={onConfirm}
              className="flex-1"
            />
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}
