import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from "react-native";
import { Check, SearchX } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SheetHeader } from "@/components/ui/sheet-header";
import { TextInput } from "@/components/ui/text-input";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { useModalClosed } from "@/hooks/use-modal-closed";
import { lightHaptic } from "@/lib/haptics";

export interface PickerOption {
  value: number;
  label: string;
  description?: string;
}

interface PickerSheetProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  /** Values currently ticked. Single-select passes at most one. */
  selected: readonly number[];
  /** Keeps the sheet open per tap and shows a Done button. */
  multiple?: boolean;
  loading?: boolean;
  /** Search field above the list; on by default past a screenful of options. */
  searchable?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  onPick: (value: number) => void;
  onClose: () => void;
  /**
   * Fired once the native `<Modal>` is fully gone. Required whenever picking
   * chains into another picker — see hooks/use-modal-flow.ts.
   */
  onClosed?: () => void;
}

/**
 * A searchable list picker in a page sheet: one row per option, a tick on the
 * selected ones, single- or multi-select.
 *
 * Why a page sheet rather than the `Select` bottom sheet: the lists this backs
 * (a whole Sonarr/Radarr library, every episode of a season) are far too long
 * for a bottom sheet's ScrollView, and they need a search field. The search
 * input is pinned above the list rather than scrolling with it, so the keyboard
 * can never cover it — the top-anchored variant of the keyboard rules in
 * CLAUDE.md, which is why no KeyboardAwareScrollView is involved.
 *
 * It wires `onClosed`, so it is safe to use as a `useModalFlow` step and to
 * chain one picker into the next.
 */
export function PickerSheet({
  visible,
  title,
  options,
  selected,
  multiple = false,
  loading = false,
  searchable,
  emptyTitle = "Nothing to pick",
  emptyMessage,
  onPick,
  onClose,
  onClosed,
}: PickerSheetProps) {
  const handleDismiss = useModalClosed(visible, onClosed);
  const listPadding = useSheetBottomPadding(16);
  const footerPadding = useSheetBottomPadding(12);
  const [query, setQuery] = useState("");

  const showSearch = searchable ?? options.length > 12;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        o.description?.toLowerCase().includes(term),
    );
  }, [options, query]);

  // The query belongs to one visit, so a reopened picker starts unfiltered.
  // Reset on open rather than on close: the flow can close this sheet without
  // going through onClose (a chained `open` flips `visible` directly), and
  // clearing mid-dismiss would re-render the whole list as it slides away.
  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={handleDismiss}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title={title} onClose={onClose} />

        {showSearch ? (
          <View className="px-4 pt-4">
            <TextInput
              placeholder="Search…"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
        ) : null}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            {/* Native indicator, not the reanimated Spinner: this one has to be
                visibly moving under OS Reduce Motion too (#196). */}
            <ActivityIndicator color="#a1a1aa" />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(option) => String(option.value)}
            contentContainerClassName="px-4 py-4 gap-2"
            contentContainerStyle={listPadding}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={16}
            windowSize={9}
            ListEmptyComponent={
              <EmptyState
                icon={<Icon icon={SearchX} size={24} color="#71717a" />}
                title={query ? "No matches" : emptyTitle}
                message={query ? undefined : emptyMessage}
              />
            }
            renderItem={({ item }) => {
              const isSelected = selected.includes(item.value);
              return (
                <Pressable
                  onPress={() => {
                    lightHaptic();
                    onPick(item.value);
                  }}
                  className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3 active:opacity-70 ${
                    isSelected
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-surface"
                  }`}
                >
                  <View className="flex-1">
                    <Text
                      className={`text-sm ${
                        isSelected
                          ? "text-primary font-semibold"
                          : "text-zinc-100 font-medium"
                      }`}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
                    {item.description ? (
                      <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? <Icon icon={Check} size={18} color="#3b82f6" /> : null}
                </Pressable>
              );
            }}
          />
        )}

        {multiple ? (
          <View className="border-t border-border px-4 py-3" style={footerPadding}>
            <Button
              label={selected.length > 0 ? `Done (${selected.length})` : "Done"}
              onPress={onClose}
              size="lg"
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
