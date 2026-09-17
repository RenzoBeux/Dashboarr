import { memo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  Check,
  ChevronRight,
  ExternalLink,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { toast, toastError } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { DashboardIconPickerSheet } from "@/components/dashboard/dashboard-icon-picker-sheet";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useConfigStore } from "@/store/config-store";
import type { WebShortcut } from "@/store/config-store";
import { generateInstanceId } from "@/lib/uuid";
import {
  DEFAULT_SHORTCUT_ICON,
  LUCIDE_ICON_NAMES,
  resolveShortcutIcon,
  type DashboardIconName,
} from "@/lib/dashboard-icons";
import {
  DASHBOARD_COLORS,
  DEFAULT_DASHBOARD_COLOR,
  resolveDashboardColor,
} from "@/lib/dashboard-colors";
import {
  SHORTCUT_NAME_MAX_LENGTH,
  shortcutHostLabel,
  validateShortcutUrl,
} from "@/lib/web-shortcuts";
import { openInBrowser } from "@/lib/open-in-browser";
import { lightHaptic } from "@/lib/haptics";
import { ICON } from "@/lib/constants";

type Mode = "list" | "add" | "edit";

/**
 * Manage the global web-shortcut list the Shortcuts dashboard widget renders
 * (#344). Mirrors the Wake-on-LAN screen: list / add / edit modes in one
 * route, a styled delete confirm, and the unsaved-changes guard on the form.
 * Icon and accent colour reuse the dashboard identity pickers so the two
 * features look like one system.
 */
export default function ShortcutsScreen() {
  const shortcuts = useConfigStore((s) => s.shortcuts);
  const setShortcuts = useConfigStore((s) => s.setShortcuts);

  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_SHORTCUT_ICON);
  const [color, setColor] = useState<string>(DEFAULT_DASHBOARD_COLOR);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WebShortcut | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setUrl("");
    setIcon(DEFAULT_SHORTCUT_ICON);
    setColor(DEFAULT_DASHBOARD_COLOR);
    setUrlError(null);
    setEditingId(null);
  };

  const closeForm = () => {
    resetForm();
    setMode("list");
  };

  const editing = editingId ? shortcuts.find((s) => s.id === editingId) : undefined;
  const formDirty =
    mode === "add"
      ? name.trim() !== "" ||
        url.trim() !== "" ||
        icon !== DEFAULT_SHORTCUT_ICON ||
        color !== DEFAULT_DASHBOARD_COLOR
      : mode === "edit" &&
        editing !== undefined &&
        (name !== editing.name ||
          url !== editing.url ||
          icon !== (editing.icon ?? DEFAULT_SHORTCUT_ICON) ||
          color !== resolveDashboardColor(editing.color));
  const guard = useUnsavedChangesGuard(formDirty, closeForm);

  const startAdd = () => {
    resetForm();
    setMode("add");
  };

  const startEdit = (shortcut: WebShortcut) => {
    setEditingId(shortcut.id);
    setName(shortcut.name);
    setUrl(shortcut.url);
    setIcon(shortcut.icon ?? DEFAULT_SHORTCUT_ICON);
    setColor(resolveDashboardColor(shortcut.color));
    setUrlError(null);
    setMode("edit");
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Name is required", "error");
      return;
    }
    const validation = validateShortcutUrl(url);
    if (validation.kind === "invalid") {
      setUrlError(validation.message);
      return;
    }

    const shortcut: WebShortcut = {
      id: editingId ?? generateInstanceId(),
      name: trimmedName.slice(0, SHORTCUT_NAME_MAX_LENGTH),
      url: validation.url,
      icon,
      color,
    };

    if (mode === "add") {
      setShortcuts([...shortcuts, shortcut]);
      toast(`${shortcut.name} added`, "success");
    } else {
      setShortcuts(shortcuts.map((s) => (s.id === editingId ? shortcut : s)));
      toast(`${shortcut.name} updated`, "success");
    }

    resetForm();
    setMode("list");
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setShortcuts(shortcuts.filter((s) => s.id !== pendingDelete.id));
    toast(`${pendingDelete.name} removed`, "success");
    setPendingDelete(null);
  };

  const handleOpen = async (shortcut: WebShortcut) => {
    if (openingId) return;
    lightHaptic();
    setOpeningId(shortcut.id);
    try {
      await openInBrowser(shortcut.url);
    } catch (err) {
      toastError(`Couldn't open ${shortcut.name}`, err);
    } finally {
      setOpeningId(null);
    }
  };

  if (mode === "add" || mode === "edit") {
    const PreviewIcon = resolveShortcutIcon(icon);
    return (
      <ScreenWrapper>
        <BackHeader
          title={mode === "add" ? "Add Shortcut" : "Edit Shortcut"}
          onBack={guard.leave}
        />

        <Card className="gap-4 mb-4">
          <TextInput
            label="Name"
            placeholder="e.g. Portainer"
            value={name}
            onChangeText={setName}
            maxLength={SHORTCUT_NAME_MAX_LENGTH}
          />
          <TextInput
            label="URL"
            placeholder="portainer.example.com or 192.168.1.10:9000"
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              if (urlError) setUrlError(null);
            }}
            error={urlError ?? undefined}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text className="text-zinc-500 text-xs -mt-2">
            https:// is assumed when no scheme is given. Opens in the system
            in-app browser.
          </Text>
        </Card>

        <Card className="gap-3 mb-4">
          <Text className="text-zinc-500 text-xs uppercase tracking-wider">
            Appearance
          </Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setIconPickerOpen(true);
            }}
            className="flex-row items-center gap-3 rounded-2xl bg-surface-light border border-border/70 px-3 py-3 active:bg-surface"
          >
            <View
              className="w-11 h-11 rounded-xl items-center justify-center"
              style={{ backgroundColor: `${color}26` }}
            >
              <Icon icon={PreviewIcon} size={22} color={color} />
            </View>
            <View className="flex-1">
              <Text className="text-zinc-100 text-sm font-semibold">Icon</Text>
              <Text className="text-zinc-500 text-xs mt-0.5">
                Tap to pick from {LUCIDE_ICON_NAMES.length} icons
              </Text>
            </View>
            <Icon icon={ChevronRight} size={ICON.MD} color="#71717a" />
          </Pressable>

          <View className="flex-row flex-wrap gap-2">
            {DASHBOARD_COLORS.map((swatch) => (
              <ColorSwatch
                key={swatch.hex}
                hex={swatch.hex}
                selected={color === swatch.hex}
                onPress={() => {
                  Haptics.selectionAsync();
                  setColor(swatch.hex);
                }}
              />
            ))}
          </View>
        </Card>

        <View className="flex-row gap-3">
          <Button
            label="Cancel"
            onPress={guard.leave}
            variant="outline"
            className="flex-1"
          />
          <Button label="Save" onPress={handleSave} className="flex-1" />
        </View>

        <DashboardIconPickerSheet
          visible={iconPickerOpen}
          onClose={() => setIconPickerOpen(false)}
          selected={icon}
          color={color}
          onSelect={(next: DashboardIconName) => setIcon(next)}
          title="Shortcut icon"
        />

        <ConfirmModal
          {...guard.discardModalProps}
          title="Discard changes?"
          message="This shortcut hasn't been saved yet."
          tone="danger"
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onConfirm={guard.confirmDiscard}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <BackHeader
        title="Shortcuts"
        right={
          <Pressable
            onPress={startAdd}
            className="active:opacity-70 p-1"
            accessibilityLabel="Add shortcut"
          >
            <Icon icon={Plus} size={22} color="#3b82f6" />
          </Pressable>
        }
      />

      {!shortcuts.length ? (
        <View className="items-center justify-center py-20 gap-3">
          <Icon icon={LinkIcon} size={40} color="#3f3f46" />
          <Text className="text-zinc-400 text-base text-center">
            No shortcuts configured
          </Text>
          <Text className="text-zinc-500 text-sm text-center px-6">
            Add links to web UIs Dashboarr doesn't integrate with, like
            Portainer, Proxmox or your router. They show up on the Shortcuts
            dashboard widget.
          </Text>
          <Button
            label="Add Shortcut"
            onPress={startAdd}
            icon={<Icon icon={Plus} size={16} color="#fff" />}
            size="sm"
          />
        </View>
      ) : (
        <View className="gap-3">
          {shortcuts.map((shortcut) => {
            const tint = resolveDashboardColor(shortcut.color);
            const ShortcutIcon = resolveShortcutIcon(shortcut.icon);
            return (
              <Card key={shortcut.id}>
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => handleOpen(shortcut)}
                    className={`flex-row items-center flex-1 active:opacity-70 ${
                      openingId === shortcut.id ? "opacity-60" : ""
                    }`}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${shortcut.name}`}
                  >
                    <View
                      className="rounded-xl p-2.5 mr-3"
                      style={{ backgroundColor: `${tint}26` }}
                    >
                      <Icon icon={ShortcutIcon} size={20} color={tint} />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-zinc-100 text-base font-medium"
                        numberOfLines={1}
                      >
                        {shortcut.name}
                      </Text>
                      <View className="flex-row items-center gap-1">
                        <Icon icon={ExternalLink} size={ICON.XS} color="#71717a" />
                        <Text className="text-zinc-500 text-xs flex-1" numberOfLines={1}>
                          {shortcutHostLabel(shortcut.url)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <View className="flex-row items-center gap-1">
                    <Pressable
                      onPress={() => startEdit(shortcut)}
                      className="p-2 active:opacity-70"
                      accessibilityLabel={`Edit ${shortcut.name}`}
                    >
                      <Icon icon={Pencil} size={16} color="#71717a" />
                    </Pressable>
                    <Pressable
                      onPress={() => setPendingDelete(shortcut)}
                      className="p-2 active:opacity-70"
                      accessibilityLabel={`Delete ${shortcut.name}`}
                    >
                      <Icon icon={Trash2} size={16} color="#71717a" />
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <ConfirmModal
        visible={pendingDelete !== null}
        title="Delete Shortcut"
        message={pendingDelete ? `Remove "${pendingDelete.name}" from Shortcuts?` : ""}
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </ScreenWrapper>
  );
}

interface ColorSwatchProps {
  hex: string;
  selected: boolean;
  onPress: () => void;
}

const ColorSwatch = memo(function ColorSwatch({ hex, selected, onPress }: ColorSwatchProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      className={`w-10 h-10 rounded-full items-center justify-center ${
        selected ? "border-2 border-white" : ""
      }`}
      style={{ backgroundColor: hex }}
    >
      {selected && <Icon icon={Check} size={ICON.SM} color="#ffffff" />}
    </Pressable>
  );
});
