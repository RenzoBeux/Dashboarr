import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { Check } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { lightHaptic } from "@/lib/haptics";

interface CategorySheetProps {
  visible: boolean;
  onClose: () => void;
  // Existing category names (from useTorrentCategories) — the picker offers
  // these plus a "No category" choice. No free-text entry: creating new
  // categories is out of scope.
  categories: string[];
  // The currently-assigned category to preselect. "" / undefined → "No
  // category". For bulk edits where selected torrents may differ, pass "".
  current?: string;
  saving?: boolean;
  subtitle?: string;
  onSave: (category: string) => void;
}

// Sentinel value for the "No category" row. qBittorrent clears a torrent's
// category when setCategory is called with an empty string.
const NONE = "";

export function CategorySheet({
  visible,
  onClose,
  categories,
  current,
  saving = false,
  subtitle,
  onSave,
}: CategorySheetProps) {
  const [selected, setSelected] = useState(current ?? NONE);

  // Reseed the selection from the torrent's current category each time the
  // sheet opens (mirrors how ShareLimitsSheet seeds its form on `visible`).
  useEffect(() => {
    if (visible) setSelected(current ?? NONE);
  }, [visible, current]);

  const rows: { value: string; label: string }[] = [
    { value: NONE, label: "No category" },
    ...categories.map((c) => ({ value: c, label: c })),
  ];

  const handleSelect = (value: string) => {
    lightHaptic();
    setSelected(value);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Category" onClose={onClose} />

        {subtitle ? (
          <Text className="text-zinc-500 text-sm px-4 pt-3">{subtitle}</Text>
        ) : null}

        <ScrollView
          contentContainerClassName="px-4 py-4"
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row) => {
            const isSelected = row.value === selected;
            return (
              <Pressable
                key={row.value || "__none__"}
                onPress={() => handleSelect(row.value)}
                className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 mb-1 ${
                  isSelected ? "bg-surface-light/70" : "active:bg-surface-light/70"
                }`}
              >
                <Text
                  className={`flex-1 text-base ${
                    isSelected
                      ? "text-primary font-semibold"
                      : row.value === NONE
                        ? "text-zinc-400 font-medium"
                        : "text-zinc-100 font-medium"
                  }`}
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
                {isSelected ? (
                  <Icon icon={Check} size={18} color="#3b82f6" />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <View className="px-4 pb-8 pt-2 border-t border-border">
          <Button
            label="Save Category"
            onPress={() => onSave(selected)}
            loading={saving}
          />
        </View>
      </View>
    </Modal>
  );
}
