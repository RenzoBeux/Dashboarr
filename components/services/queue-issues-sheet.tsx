import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { useModalClosed } from "@/hooks/use-modal-closed";
import type { ArrQueueItem } from "@/lib/arr-queue-adapter";

interface QueueIssuesSheetProps {
  visible: boolean;
  // Display name of the owning service kind (e.g. "Sonarr").
  serviceName: string;
  issues: ArrQueueItem[];
  onSelect: (item: ArrQueueItem) => void;
  onClose: () => void;
  /**
   * Fired once the native `<Modal>` is fully gone. Required here because this
   * sheet chains into an ActionSheet — see hooks/use-modal-flow.ts.
   */
  onClosed?: () => void;
}

// The blocked/failed grabs for one *arr instance, one tappable row each.
// Unlike HealthIssuesSheet this one IS a modal-flow step: picking a row opens
// the removal ActionSheet, so it wires `onClosed` and must only ever be
// opened/closed through the flow.
export function QueueIssuesSheet({
  visible,
  serviceName,
  issues,
  onSelect,
  onClose,
  onClosed,
}: QueueIssuesSheetProps) {
  const handleDismiss = useModalClosed(visible, onClosed);
  const scrollPadding = useSheetBottomPadding(16);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={handleDismiss}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title={`${serviceName} Import Issues`} onClose={onClose} />

        <ScrollView
          contentContainerClassName="px-4 py-4 gap-2"
          contentContainerStyle={scrollPadding}
          showsVerticalScrollIndicator={false}
        >
          {issues.length === 0 ? (
            <EmptyState
              icon={<Icon icon={CheckCircle2} size={28} color="#22c55e" />}
              title="Nothing stuck"
              message={`${serviceName} has no blocked or failed grabs right now`}
            />
          ) : null}

          {issues.map((item) => {
            const isError = item.severity === "error";
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item)}
                className="flex-row gap-3 bg-surface border border-border rounded-2xl p-3 active:opacity-70"
              >
                <View className="pt-0.5">
                  <Icon
                    icon={AlertTriangle}
                    size={18}
                    color={isError ? "#f87171" : "#fbbf24"}
                  />
                </View>

                <View className="flex-1 gap-1">
                  <Text className="text-zinc-200 text-sm font-semibold" numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.subtitle ? (
                    <Text className="text-zinc-500 text-xs">{item.subtitle}</Text>
                  ) : null}

                  <Text
                    className={`text-xs font-semibold ${
                      isError ? "text-red-300" : "text-amber-200"
                    }`}
                  >
                    {item.statusLabel}
                  </Text>

                  {item.messages.map((message, idx) => (
                    <Text key={idx} className="text-zinc-400 text-sm">
                      {message}
                    </Text>
                  ))}

                  {/* The release name is what the removal actions act on, so it
                      stays visible even though the media title leads the row. */}
                  <Text className="text-zinc-600 text-xs mt-1" numberOfLines={2}>
                    {item.releaseTitle}
                  </Text>
                </View>

                <View className="justify-center">
                  <Icon icon={ChevronRight} size={16} color="#71717a" />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
