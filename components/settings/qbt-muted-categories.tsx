import { useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { useConfigStore } from "@/store/config-store";
import { useTorrentCategories } from "@/hooks/use-qbittorrent";
import { SelectRow } from "@/components/dashboard/widget-settings/widget-settings-blocks";
import { lightHaptic } from "@/lib/haptics";

/**
 * Per-instance mute list for the "Torrent completed" notification (#310).
 * Muted categories (exact, case-sensitive names; "" = uncategorized) are
 * silenced in both the backend push pipeline and the local watcher — the
 * cross-seed injection category being the motivating case.
 *
 * Rendered as a compact summary row so the Notifications card stays short on
 * servers with dozens of categories; the full checklist lives in a pageSheet.
 * Toggles apply immediately, so an iOS swipe-dismiss can't discard changes.
 * The sheet never chains into another modal or navigation, so plain useState
 * visibility is safe (see the modal sequencing rules in CLAUDE.md).
 */
export function QbtMutedCategories({
  instanceId,
  disabled,
}: {
  instanceId: string;
  disabled?: boolean;
}) {
  const mutedList = useConfigStore(
    (s) => s.notificationSettings.qbtMutedCategories?.[instanceId],
  );
  const [sheetVisible, setSheetVisible] = useState(false);

  const summary =
    mutedList && mutedList.length > 0
      ? mutedList.map((c) => (c === "" ? "Uncategorized" : c)).join(", ")
      : "None — every category notifies";

  return (
    <View>
      <Text className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
        Muted categories
      </Text>
      <Text className="text-zinc-500 text-xs leading-5 mb-2">
        No "Download complete" notification for torrents in a muted category
        (e.g. cross-seed's injection category). Applies to this instance only.
      </Text>
      <Pressable
        onPress={() => {
          if (disabled) return;
          setSheetVisible(true);
        }}
        className="flex-row items-center gap-3 bg-surface-light rounded-2xl border border-border px-3 py-2.5 active:opacity-70"
      >
        <Text
          className={`flex-1 text-sm font-medium ${
            mutedList && mutedList.length > 0 ? "text-zinc-200" : "text-zinc-500"
          }`}
          numberOfLines={1}
        >
          {summary}
        </Text>
        <Icon icon={ChevronRight} size={16} color="#71717a" />
      </Pressable>

      <MutedCategoriesSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        instanceId={instanceId}
      />
    </View>
  );
}

function MutedCategoriesSheet({
  visible,
  onClose,
  instanceId,
}: {
  visible: boolean;
  onClose: () => void;
  instanceId: string;
}) {
  const mutedList = useConfigStore(
    (s) => s.notificationSettings.qbtMutedCategories?.[instanceId],
  );
  const setMuted = useConfigStore((s) => s.setQbtMutedCategories);
  const { data: fetched, isLoading, isSuccess } = useTorrentCategories(instanceId);
  const footerPadding = useSheetBottomPadding();

  const categories = fetched ?? [];
  const muted = new Set(mutedList ?? []);
  // Muted names no longer on the server stay listed so they can be unmuted.
  const stale = (mutedList ?? []).filter(
    (c) => c !== "" && !categories.includes(c),
  );

  const toggle = (name: string) => {
    lightHaptic();
    const next = muted.has(name)
      ? (mutedList ?? []).filter((c) => c !== name)
      : [...(mutedList ?? []), name];
    setMuted(instanceId, next);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Muted Categories" onClose={onClose} />

        <Text className="text-zinc-500 text-sm px-4 pt-3">
          Checked categories won't send "Download complete" notifications.
        </Text>

        <ScrollView
          contentContainerClassName="px-4 py-4"
          showsVerticalScrollIndicator={false}
        >
          <View className="bg-surface-light rounded-2xl border border-border divide-y divide-border/60 overflow-hidden">
            <SelectRow
              label="Uncategorized"
              caption="Torrents without a category"
              selected={muted.has("")}
              onPress={() => toggle("")}
            />
            {categories.map((name) => (
              <SelectRow
                key={name}
                label={name}
                selected={muted.has(name)}
                onPress={() => toggle(name)}
              />
            ))}
            {stale.map((name) => (
              <SelectRow
                key={name}
                label={name}
                caption="Not on server"
                selected
                onPress={() => toggle(name)}
              />
            ))}
          </View>
          {!isLoading && !isSuccess ? (
            <Text className="text-zinc-600 text-xs mt-2">
              Couldn't load categories from qBittorrent.
            </Text>
          ) : null}
        </ScrollView>

        <View className="px-4 pb-8 pt-2 border-t border-border" style={footerPadding}>
          <Button label="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
