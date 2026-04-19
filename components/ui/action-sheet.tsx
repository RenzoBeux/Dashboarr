import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { SheetHeader } from "@/components/ui/sheet-header";
import { lightHaptic, errorHaptic } from "@/lib/haptics";

export type ActionSheetVariant = "default" | "danger";

export interface ActionSheetAction {
  label: string;
  icon?: React.ReactNode;
  variant?: ActionSheetVariant;
  disabled?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: ActionSheetAction[];
}

export function ActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  actions,
}: ActionSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title={title ?? "Actions"} onClose={onClose} />
        {subtitle && (
          <Text
            className="px-4 pt-3 text-zinc-500 text-xs"
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
        <ScrollView contentContainerClassName="py-2">
          {actions.map((action, i) => (
            <Pressable
              key={i}
              disabled={action.disabled}
              onPress={() => {
                if (action.variant === "danger") errorHaptic();
                else lightHaptic();
                onClose();
                action.onPress();
              }}
              className={`flex-row items-center px-4 py-3.5 active:bg-surface-light ${
                action.disabled ? "opacity-40" : ""
              }`}
            >
              {action.icon && <View className="mr-3">{action.icon}</View>}
              <Text
                className={`text-base flex-1 ${
                  action.variant === "danger"
                    ? "text-danger font-semibold"
                    : "text-zinc-100"
                }`}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
