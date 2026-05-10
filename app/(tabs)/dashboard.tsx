import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  Settings,
  X,
  Plus,
  ChevronsUpDown,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useConfigStore } from "@/store/config-store";
import { CardErrorBoundary } from "@/components/common/error-boundary";
import { ICON } from "@/lib/constants";
import {
  WIDGET_REGISTRY,
  isWidgetServiceEnabled,
} from "@/components/dashboard/widget-registry";
import { AddWidgetSheet } from "@/components/dashboard/add-widget-sheet";
import { WidgetSettingsSheet } from "@/components/dashboard/widget-settings-sheet";
import { DashboardPickerSheet } from "@/components/dashboard/dashboard-picker-sheet";

export default function DashboardScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  const services = useConfigStore((s) => s.services);
  const dashboards = useConfigStore((s) => s.dashboards);
  const activeDashboardId = useConfigStore((s) => s.activeDashboardId);
  const removeSlot = useConfigStore((s) => s.removeSlot);
  const moveSlot = useConfigStore((s) => s.moveSlot);
  const [editMode, setEditMode] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [dashboardPickerVisible, setDashboardPickerVisible] = useState(false);
  const [settingsForSlot, setSettingsForSlot] = useState<string | null>(null);

  const activeDashboard =
    dashboards.find((d) => d.id === activeDashboardId) ?? dashboards[0];
  const slots = activeDashboard?.widgets ?? [];

  const hasAnyEnabled = Object.values(services).some((s) => s.enabled);

  // Slots whose required service is disabled get filtered out so users don't
  // see broken cards. Service-health/calendar/wol-devices have `service: null`
  // and so always render. Speed Stats accepts an array (qbit OR sab) — the
  // helper handles all three shapes.
  const visibleSlots = slots.filter((slot) => {
    const widget = WIDGET_REGISTRY[slot.widgetId];
    if (!widget) return false;
    return isWidgetServiceEnabled(widget, services);
  });

  function handleMove(slotId: string, direction: "up" | "down") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    moveSlot(slotId, direction);
  }

  function handleRemove(slotId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeSlot(slotId);
  }

  function openPicker() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerVisible(true);
  }

  function openSettings(slotId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSettingsForSlot(slotId);
  }

  function openDashboardPicker() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDashboardPickerVisible(true);
  }

  const dashboardName = activeDashboard?.name ?? "Dashboarr";

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between mt-2 mb-4">
        <TouchableOpacity
          onPress={openDashboardPicker}
          className="flex-row items-center gap-1.5"
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text className="text-zinc-100 text-2xl font-bold" numberOfLines={1}>
            {dashboardName}
          </Text>
          {/* Always show the chevron so single-dashboard users still see the
              title is tappable (lets them rename or add another). */}
          <Icon icon={ChevronsUpDown} size={ICON.SM} color="#71717a" />
        </TouchableOpacity>
        {hasAnyEnabled && (
          <TouchableOpacity
            onPress={() => setEditMode((e) => !e)}
            className="p-2"
            hitSlop={8}
          >
            {editMode ? (
              <Icon icon={Check} size={ICON.MD} color="#22c55e" />
            ) : (
              <Icon icon={Pencil} size={ICON.MD} color="#71717a" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {!hasAnyEnabled ? (
        <View className="flex-1 items-center justify-center py-20">
          <Text className="text-zinc-400 text-base text-center">
            No services configured yet.
          </Text>
          <Text className="text-zinc-500 text-sm text-center mt-1">
            Go to Settings to add your first service.
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {editMode && (
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-2"
            >
              <Text className="text-primary text-sm font-medium text-center">
                Reorder, remove, or add widgets
              </Text>
            </Animated.View>
          )}
          {visibleSlots.map((slot, visibleIndex) => {
            const widget = WIDGET_REGISTRY[slot.widgetId];
            if (!widget) return null;
            const { component: WidgetComponent, label, settingsComponent } = widget;
            const isFirst = visibleIndex === 0;
            const isLast = visibleIndex === visibleSlots.length - 1;

            return (
              <Animated.View
                key={slot.id}
                entering={FadeInDown.delay(visibleIndex * 80).springify()}
              >
                {editMode && (
                  <Animated.View
                    entering={FadeIn}
                    exiting={FadeOut}
                    className="flex-row items-center justify-between mb-1 px-1"
                  >
                    <View className="flex-row items-center gap-1.5 flex-1">
                      <Icon icon={GripVertical} size={ICON.SM} color="#52525b" />
                      <Text className="text-zinc-500 text-xs font-medium" numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <TouchableOpacity
                        onPress={() => handleMove(slot.id, "up")}
                        disabled={isFirst}
                        className="p-1"
                        hitSlop={6}
                      >
                        <Icon icon={ChevronUp} size={ICON.MD} color={isFirst ? "#3f3f46" : "#a1a1aa"} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleMove(slot.id, "down")}
                        disabled={isLast}
                        className="p-1"
                        hitSlop={6}
                      >
                        <Icon icon={ChevronDown} size={ICON.MD} color={isLast ? "#3f3f46" : "#a1a1aa"} />
                      </TouchableOpacity>
                      {settingsComponent && (
                        <TouchableOpacity
                          onPress={() => openSettings(slot.id)}
                          className="p-1 ml-1"
                          hitSlop={6}
                        >
                          <Icon icon={Settings} size={ICON.MD} color="#60a5fa" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => handleRemove(slot.id)}
                        className="p-1 ml-1"
                        hitSlop={6}
                      >
                        <Icon icon={X} size={ICON.MD} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                )}
                <View
                  style={editMode ? {
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: "#3f3f46",
                    borderRadius: 16,
                    opacity: 0.85,
                  } : undefined}
                >
                  <CardErrorBoundary>
                    <WidgetComponent slotId={slot.id} />
                  </CardErrorBoundary>
                </View>
              </Animated.View>
            );
          })}

          {editMode && (
            <Animated.View entering={FadeIn} exiting={FadeOut}>
              <TouchableOpacity
                onPress={openPicker}
                className="flex-row items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-2xl py-4"
              >
                <Icon icon={Plus} size={ICON.MD} color="#a1a1aa" />
                <Text className="text-zinc-300 text-sm font-medium">Add widget</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      )}

      <AddWidgetSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} />
      <WidgetSettingsSheet
        slotId={settingsForSlot}
        onClose={() => setSettingsForSlot(null)}
      />
      <DashboardPickerSheet
        visible={dashboardPickerVisible}
        onClose={() => setDashboardPickerVisible(false)}
      />
    </ScreenWrapper>
  );
}
