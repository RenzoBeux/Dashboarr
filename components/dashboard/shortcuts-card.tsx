import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Plus, Settings } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toastError } from "@/components/ui/toast";
import { useConfigStore } from "@/store/config-store";
import type { WebShortcut } from "@/store/config-store";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useServiceTileLayout } from "@/hooks/use-service-tile-cell";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import {
  SHORTCUTS_DEFAULT_SETTINGS,
  resolveVisibleShortcuts,
  type ShortcutsSettingsValue,
} from "@/components/dashboard/widget-settings/shortcuts-settings";
import { resolveShortcutIcon } from "@/lib/dashboard-icons";
import { resolveDashboardColor } from "@/lib/dashboard-colors";
import { openInBrowser } from "@/lib/open-in-browser";
import { lightHaptic } from "@/lib/haptics";
import { ICON } from "@/lib/constants";

/**
 * Shortcuts widget (#344): a grid of user-defined web links that open in the
 * system in-app browser. The list itself is global (managed at /shortcuts,
 * like Wake-on-LAN devices); each placement picks "all" or a subset in its
 * settings sheet, so a Home and a Cabin dashboard can show different links.
 */
export function ShortcutsCard({ slotId }: WidgetComponentProps) {
  const shortcuts = useConfigStore((s) => s.shortcuts);
  const { settings } = useWidgetSettings<ShortcutsSettingsValue>(
    slotId,
    SHORTCUTS_DEFAULT_SETTINGS,
  );
  const router = useRouter();
  // Same tile layout as the Status widget: the label carries user-typed text,
  // so cells need a computed pixel width or one long name knocks every
  // following tile out of its column (see hooks/use-service-tile-cell.ts).
  const { width: tileWidth, gap: tileGap } = useServiceTileLayout();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const visible = resolveVisibleShortcuts(settings.shortcutIds, shortcuts);

  const openShortcut = async (shortcut: WebShortcut) => {
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

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center justify-between flex-1">
          <CardTitle>Shortcuts</CardTitle>
          <Pressable
            onPress={() => router.push("/shortcuts")}
            className="p-1 active:opacity-70"
            hitSlop={6}
            accessibilityLabel="Manage shortcuts"
          >
            <Icon icon={Settings} size={ICON.SM} color="#71717a" />
          </Pressable>
        </View>
      </CardHeader>

      {shortcuts.length === 0 ? (
        <EmptyState
          compact
          title="No shortcuts yet"
          message="Add links to Portainer, Proxmox, your router or anything else you self-host."
          action={
            <Button
              label="Add Shortcut"
              size="sm"
              onPress={() => router.push("/shortcuts")}
              icon={<Icon icon={Plus} size={14} color="#fff" />}
            />
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          title="No shortcuts selected"
          message="Pick which shortcuts to show in this widget's settings."
        />
      ) : (
        <View className="flex-row flex-wrap" style={{ gap: tileGap }}>
          {visible.map((shortcut) => {
            const color = resolveDashboardColor(shortcut.color);
            const ShortcutIcon = resolveShortcutIcon(shortcut.icon);
            const opening = openingId === shortcut.id;
            return (
              <View key={shortcut.id} style={{ width: tileWidth }}>
                <Pressable
                  onPress={() => openShortcut(shortcut)}
                  className={`w-full items-center gap-1.5 active:opacity-70 ${opening ? "opacity-60" : ""}`}
                  hitSlop={6}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${shortcut.name}`}
                >
                  <View
                    className="rounded-xl p-2.5"
                    style={{ backgroundColor: `${color}26` }}
                  >
                    <Icon icon={ShortcutIcon} size={ICON.LG} color={color} />
                  </View>
                  <Text
                    className="text-zinc-400 text-xs text-center w-full"
                    numberOfLines={2}
                  >
                    {shortcut.name}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}
