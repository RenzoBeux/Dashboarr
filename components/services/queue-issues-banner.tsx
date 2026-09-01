import { useEffect, useMemo, useState, type ComponentType } from "react";
import { View, Text, Pressable } from "react-native";
import {
  AlertTriangle,
  ChevronRight,
  Ban,
  FolderInput,
  Search,
  Trash2,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { ConfirmModal, type ConfirmTone } from "@/components/common/confirm-modal";
import { QueueIssuesSheet } from "@/components/services/queue-issues-sheet";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useArrQueueIssues,
  useForceImportArrQueue,
  useRemoveFromArrQueue,
  type ArrQueueRemoveMode,
} from "@/hooks/use-arr-queue-issues";
import { worstQueueSeverity } from "@/lib/arr-queue-issues";
import { lightHaptic, mediumHaptic } from "@/lib/haptics";
import type { ArrQueueAdapter, ArrQueueItem } from "@/lib/arr-queue-adapter";

interface QueueIssuesBannerProps {
  adapter: ArrQueueAdapter;
  // Follows the screen's active instance when omitted.
  instanceId?: string;
  className?: string;
}

// Everything a stuck grab can have done to it: the three removal modes (#285)
// plus importing it anyway (#325).
type QueueActionMode = ArrQueueRemoveMode | "forceImport";

interface PendingAction {
  item: ArrQueueItem;
  mode: QueueActionMode;
}

// Confirm-dialog copy per action. "Blocklist" here means *arr marks the grab as
// failed so the release is never picked up again; the search variant
// additionally kicks off a hunt for a replacement (issue #285).
const ACTION_COPY: Record<
  QueueActionMode,
  {
    title: string;
    confirmLabel: string;
    tone: ConfirmTone;
    icon: ComponentType<any>;
    describe: (service: string) => string;
  }
> = {
  forceImport: {
    title: "Force import?",
    confirmLabel: "Force Import",
    tone: "default",
    icon: FolderInput,
    describe: (service) =>
      `${service} imports the downloaded files even though it blocked them, replacing the current file if one exists.`,
  },
  remove: {
    title: "Remove from queue?",
    confirmLabel: "Remove",
    tone: "danger",
    icon: Trash2,
    describe: (service) =>
      `${service} drops this grab and deletes it from the download client. The release stays eligible, so it can be grabbed again.`,
  },
  blocklistAndSearch: {
    title: "Blocklist and search?",
    confirmLabel: "Blocklist & Search",
    tone: "danger",
    icon: Ban,
    describe: (service) =>
      `${service} removes this grab, blocks the release so it is never grabbed again, and starts searching for a replacement.`,
  },
  blocklist: {
    title: "Blocklist release?",
    confirmLabel: "Blocklist",
    tone: "danger",
    icon: Ban,
    describe: (service) =>
      `${service} removes this grab and blocks the release so it is never grabbed again. No replacement search runs.`,
  },
};

/**
 * Top-of-screen banner for an *arr view: when the active instance has grabs
 * stuck with a warning or error (a blocked import, a stalled or failed
 * download), it shows a tappable summary that opens the issue list, where each
 * item can be removed or blocklisted (#285), and a blocked import can be
 * forced through (#325). Renders null when the queue is
 * healthy. See lib/arr-queue-issues.ts for why the copy says "queue issues"
 * rather than "import issues" — the detection is deliberately broader.
 *
 * Owns the whole modal chain — sheet → actions → confirm — through a single
 * useModalFlow, per the sequencing rules in CLAUDE.md.
 */
export function QueueIssuesBanner({
  adapter,
  instanceId,
  className = "",
}: QueueIssuesBannerProps) {
  const { issues: fetched } = useArrQueueIssues(adapter, instanceId);
  const removeMutation = useRemoveFromArrQueue(adapter, instanceId);
  const forceImportMutation = useForceImportArrQueue(adapter, instanceId);

  // Queue ids already removed on the service but still in the cached response
  // until the invalidated refetch lands. Without this the list reopens with the
  // row the user just handled still on it, and tapping it again fires a DELETE
  // for an id the service no longer has (404 → error toast).
  const [removedIds, setRemovedIds] = useState<number[]>([]);

  // Forget an id once the refetch confirms it's gone, so the set can't grow
  // unbounded across a long session.
  useEffect(() => {
    setRemovedIds((prev) => {
      const next = prev.filter((id) => fetched.some((i) => i.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [fetched]);

  const issues = useMemo(
    () => fetched.filter((i) => !removedIds.includes(i.id)),
    [fetched, removedIds],
  );
  const severity = worstQueueSeverity(issues);

  const flow = useModalFlow<{
    issues: void;
    itemActions: ArrQueueItem;
    confirmAction: PendingAction;
  }>();

  const sheetItem = flow.payload("itemActions");
  const pending = flow.payload("confirmAction");

  const actions: ActionSheetAction[] = sheetItem
    ? [
        // The constructive fix comes first: import the blocked download anyway
        // (#325). Only offered where it can work — an import-blocked grab on a
        // service whose adapter implements forceImport.
        ...(sheetItem.canForceImport && adapter.forceImport
          ? [
              {
                label: "Force import",
                icon: <Icon icon={FolderInput} size={18} color="#34d399" />,
                onPress: () =>
                  flow.open("confirmAction", {
                    item: sheetItem,
                    mode: "forceImport" as const,
                  }),
              },
            ]
          : []),
        {
          label: "Remove from queue",
          icon: <Icon icon={Trash2} size={18} color="#a1a1aa" />,
          onPress: () =>
            flow.open("confirmAction", { item: sheetItem, mode: "remove" }),
        },
        // Both blocklist actions depend on the service being able to blocklist
        // during a removal. Where it can't, offering them would silently do a
        // plain remove and the release would come straight back.
        ...(adapter.supportsBlocklist !== false
          ? [
              {
                label: "Blocklist & Search",
                icon: <Icon icon={Search} size={18} color="#ef4444" />,
                variant: "danger" as const,
                onPress: () =>
                  flow.open("confirmAction", {
                    item: sheetItem,
                    mode: "blocklistAndSearch" as const,
                  }),
              },
              {
                label: "Blocklist only",
                icon: <Icon icon={Ban} size={18} color="#ef4444" />,
                variant: "danger" as const,
                onPress: () =>
                  flow.open("confirmAction", {
                    item: sheetItem,
                    mode: "blocklist" as const,
                  }),
              },
            ]
          : []),
      ]
    : [];

  const confirmAction = () => {
    if (!pending) return;
    const { item, mode } = pending;
    flow.close();

    if (mode === "forceImport") {
      if (!item.downloadId) return;
      forceImportMutation.mutate(
        { downloadId: item.downloadId },
        {
          // Unlike a removal the row is NOT hidden: the import runs async on
          // the server, and hiding it via removedIds would also hide an import
          // that fails and stays blocked — permanently, since the prune effect
          // only forgets ids that leave the queue. The invalidated refetch
          // clears the row as soon as *arr moves it out of the blocked state.
          onSuccess: () => {
            if (issues.some((i) => i.id !== item.id)) flow.open("issues");
          },
        },
      );
      return;
    }

    removeMutation.mutate(
      { queueId: item.id, mode },
      {
        // Back to the list so several stuck grabs can be cleared in a row. The
        // just-handled item is hidden immediately; when it was the last one the
        // list is empty and there is nothing to return to.
        onSuccess: () => {
          setRemovedIds((prev) =>
            prev.includes(item.id) ? prev : [...prev, item.id],
          );
          if (issues.some((i) => i.id !== item.id)) flow.open("issues");
        },
      },
    );
  };

  const isError = severity === "error";
  const label =
    issues.length === 1 ? "1 queue issue" : `${issues.length} queue issues`;

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
        {...flow.bind("confirmAction")}
        title={pending ? ACTION_COPY[pending.mode].title : ""}
        message={
          pending
            ? `${ACTION_COPY[pending.mode].describe(adapter.displayName)}\n\n${pending.item.releaseTitle}`
            : ""
        }
        icon={pending ? ACTION_COPY[pending.mode].icon : Trash2}
        tone={pending ? ACTION_COPY[pending.mode].tone : "danger"}
        confirmLabel={pending ? ACTION_COPY[pending.mode].confirmLabel : undefined}
        onConfirm={confirmAction}
      />
    </>
  );
}
