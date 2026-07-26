import { View, Text, Pressable } from "react-native";
import { AlertTriangle, ChevronRight, Ban, Search, Trash2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { QueueIssuesSheet } from "@/components/services/queue-issues-sheet";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useArrQueueIssues,
  useRemoveFromArrQueue,
  type ArrQueueRemoveMode,
} from "@/hooks/use-arr-queue-issues";
import { lightHaptic, mediumHaptic } from "@/lib/haptics";
import type { ArrQueueAdapter, ArrQueueItem } from "@/lib/arr-queue-adapter";

interface QueueIssuesBannerProps {
  adapter: ArrQueueAdapter;
  // Follows the screen's active instance when omitted.
  instanceId?: string;
  className?: string;
}

interface PendingRemoval {
  item: ArrQueueItem;
  mode: ArrQueueRemoveMode;
}

// Copy per removal mode. "Blocklist" here means *arr marks the grab as failed so
// the release is never picked up again; the search variant additionally kicks
// off a hunt for a replacement (issue #285).
const REMOVAL_COPY: Record<
  ArrQueueRemoveMode,
  { title: string; confirmLabel: string; describe: (service: string) => string }
> = {
  remove: {
    title: "Remove from queue?",
    confirmLabel: "Remove",
    describe: (service) =>
      `${service} drops this grab and deletes it from the download client. The release stays eligible, so it can be grabbed again.`,
  },
  blocklistAndSearch: {
    title: "Blocklist and search?",
    confirmLabel: "Blocklist & Search",
    describe: (service) =>
      `${service} removes this grab, blocks the release so it is never grabbed again, and starts searching for a replacement.`,
  },
  blocklist: {
    title: "Blocklist release?",
    confirmLabel: "Blocklist",
    describe: (service) =>
      `${service} removes this grab and blocks the release so it is never grabbed again. No replacement search runs.`,
  },
};

/**
 * Top-of-screen banner for an *arr view: when the active instance has grabs
 * stuck with a warning or error (a blocked import, a failed download), it shows
 * a tappable summary that opens the issue list, where each item can be removed
 * or blocklisted (#285). Renders null when the queue is healthy.
 *
 * Owns the whole modal chain — sheet → actions → confirm — through a single
 * useModalFlow, per the sequencing rules in CLAUDE.md.
 */
export function QueueIssuesBanner({
  adapter,
  instanceId,
  className = "",
}: QueueIssuesBannerProps) {
  const { issues, severity } = useArrQueueIssues(adapter, instanceId);
  const removeMutation = useRemoveFromArrQueue(adapter, instanceId);

  const flow = useModalFlow<{
    issues: void;
    itemActions: ArrQueueItem;
    confirmRemove: PendingRemoval;
  }>();

  const sheetItem = flow.payload("itemActions");
  const pending = flow.payload("confirmRemove");

  const actions: ActionSheetAction[] = sheetItem
    ? [
        {
          label: "Remove from queue",
          icon: <Icon icon={Trash2} size={18} color="#a1a1aa" />,
          onPress: () =>
            flow.open("confirmRemove", { item: sheetItem, mode: "remove" }),
        },
        {
          label: "Blocklist & Search",
          icon: <Icon icon={Search} size={18} color="#ef4444" />,
          variant: "danger",
          onPress: () =>
            flow.open("confirmRemove", {
              item: sheetItem,
              mode: "blocklistAndSearch",
            }),
        },
        {
          label: "Blocklist only",
          icon: <Icon icon={Ban} size={18} color="#ef4444" />,
          variant: "danger",
          onPress: () =>
            flow.open("confirmRemove", { item: sheetItem, mode: "blocklist" }),
        },
      ]
    : [];

  const confirmRemove = () => {
    if (!pending) return;
    flow.close();
    removeMutation.mutate(
      { queueId: pending.item.id, mode: pending.mode },
      {
        // Back to the list so several stuck grabs can be cleared in a row. The
        // just-handled item is filtered out; when it was the last one the list
        // is empty and there is nothing to return to.
        onSuccess: () => {
          if (issues.some((i) => i.id !== pending.item.id)) flow.open("issues");
        },
      },
    );
  };

  const isError = severity === "error";
  const label =
    issues.length === 1 ? "1 import issue" : `${issues.length} import issues`;

  // Only the banner itself is conditional. The modals stay mounted even once
  // the queue is clean — clearing the last issue resolves the query mid-dismiss,
  // and unmounting a modal that is still animating out is the iOS freeze from
  // issue #83.
  return (
    <>
      {severity ? (
        <Pressable
          onPress={() => {
            lightHaptic();
            flow.open("issues");
          }}
          className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 active:opacity-70 ${
            isError
              ? "border-red-600/40 bg-red-600/10"
              : "border-amber-500/40 bg-amber-500/10"
          } ${className}`}
        >
          <Icon
            icon={AlertTriangle}
            size={16}
            color={isError ? "#f87171" : "#fbbf24"}
          />
          <View className="flex-1">
            <Text
              className={`text-sm font-semibold ${
                isError ? "text-red-300" : "text-amber-200"
              }`}
            >
              {label}
            </Text>
            <Text
              className={`text-xs ${
                isError ? "text-red-200/80" : "text-amber-100/80"
              }`}
            >
              {`Tap to review stuck ${adapter.displayName} downloads`}
            </Text>
          </View>
          <Icon
            icon={ChevronRight}
            size={16}
            color={isError ? "#fca5a5" : "#fcd34d"}
          />
        </Pressable>
      ) : null}

      <QueueIssuesSheet
        {...flow.bind("issues")}
        serviceName={adapter.displayName}
        issues={issues}
        onSelect={(item) => {
          mediumHaptic();
          flow.open("itemActions", item);
        }}
      />

      <ActionSheet
        {...flow.bind("itemActions")}
        title={sheetItem?.title}
        subtitle={sheetItem?.statusLabel}
        actions={actions}
      />

      <ConfirmModal
        {...flow.bind("confirmRemove")}
        title={pending ? REMOVAL_COPY[pending.mode].title : ""}
        message={
          pending
            ? `${REMOVAL_COPY[pending.mode].describe(adapter.displayName)}\n\n${pending.item.releaseTitle}`
            : ""
        }
        icon={pending?.mode === "remove" ? Trash2 : Ban}
        tone="danger"
        confirmLabel={pending ? REMOVAL_COPY[pending.mode].confirmLabel : undefined}
        onConfirm={confirmRemove}
      />
    </>
  );
}
