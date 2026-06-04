import { memo, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  Settings,
  SlidersHorizontal,
  Sparkles,
  X,
  Plus,
  ChevronsUpDown,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useConfigStore } from "@/store/config-store";
import { CardErrorBoundary } from "@/components/common/error-boundary";
import { ICON, type WidgetId } from "@/lib/constants";
import {
  WIDGET_REGISTRY,
  isWidgetServiceAttached,
  isWidgetServiceEnabled,
} from "@/components/dashboard/widget-registry";
import { AddWidgetSheet } from "@/components/dashboard/add-widget-sheet";
import { WidgetSettingsSheet } from "@/components/dashboard/widget-settings-sheet";
import { DashboardPickerSheet } from "@/components/dashboard/dashboard-picker-sheet";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { resolveDashboardColor } from "@/lib/dashboard-colors";

// Memoized so toggling editMode (which re-renders DashboardScreen) doesn't
// re-render the heavy, data-fetching widget bodies. editMode only drives the
// surrounding chrome (the per-slot control row + dashed border), so each
// widget's props (widgetId/slotId) stay stable and React.memo skips the
// expensive subtree — that's what makes entering edit mode feel instant on a
// full dashboard instead of stalling while every widget re-runs its hooks.
const WidgetSlotBody = memo(function WidgetSlotBody({
  widgetId,
  slotId,
}: {
  widgetId: WidgetId;
  slotId: string;
}) {
  const widget = WIDGET_REGISTRY[widgetId];
  if (!widget) return null;
  const WidgetComponent = widget.component;
  return (
    <CardErrorBoundary>
      <WidgetComponent slotId={slotId} />
    </CardErrorBoundary>
  );
});

export default function DashboardScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  const services = useConfigStore((s) => s.services);
  const dashboards = useConfigStore((s) => s.dashboards);
  const activeDashboardId = useConfigStore((s) => s.activeDashboardId);
  const removeSlot = useConfigStore((s) => s.removeSlot);
  const moveSlot = useConfigStore((s) => s.moveSlot);
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [showEditControls, setShowEditControls] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [dashboardPickerVisible, setDashboardPickerVisible] = useState(false);
  const [settingsForSlot, setSettingsForSlot] = useState<string | null>(null);

  // Entering edit mode mounts a per-widget control row (several SVG icons each)
  // for every visible widget at once — heavy enough to stall the tap. So show
  // the cheap edit affordance (dashed border + banner) immediately on toggle,
  // then mount the control rows on the next frame. The pencil tap feels instant
  // and the controls pop in a frame later instead of freezing on the tap.
  useEffect(() => {
    if (!editMode) {
      setShowEditControls(false);
      return;
    }
    const handle = requestAnimationFrame(() => setShowEditControls(true));
    return () => cancelAnimationFrame(handle);
  }, [editMode]);

  const activeDashboard =
    dashboards.find((d) => d.id === activeDashboardId) ?? dashboards[0];
  const slots = activeDashboard?.widgets ?? [];
  // Dashboards with attachedInstances === undefined are in "auto-attach
  // mode": they include every current and future service instance. Show a
  // small banner so the semantic is visible and one-tap-curatable.
  const isAutoAttach = activeDashboard?.attachedInstances === undefined;
  const dashboardColor = resolveDashboardColor(activeDashboard?.color);

  const attachedKinds = useAttachedKinds();
  const hasAnyEnabled = Object.values(services).some((s) => s.enabled);

  // Slots whose required service is disabled OR has no attached instance on
  // this dashboard get filtered out so users don't see broken/irrelevant
  // cards. Service-health/calendar/wol-devices have `service: null` and so
  // always render. Speed Stats accepts an array (qbit OR sab) — the helpers
  // handle all three shapes.
  const visibleSlots = slots.filter((slot) => {
    const widget = WIDGET_REGISTRY[slot.widgetId];
    if (!widget) return false;
    if (!isWidgetServiceEnabled(widget, services)) return false;
    return isWidgetServiceAttached(widget, attachedKinds);
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
        <View className="flex-row items-center">
          {activeDashboard && (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                router.push(`/dashboard-edit/${activeDashboard.id}` as any);
              }}
              className="p-2"
              hitSlop={8}
              accessibilityLabel="Configure dashboard"
            >
              <Icon icon={SlidersHorizontal} size={ICON.MD} color="#71717a" />
            </TouchableOpacity>
          )}
          {hasAnyEnabled && (
            <TouchableOpacity
              onPress={() => setEditMode((e) => !e)}
              className="p-2"
              hitSlop={8}
              accessibilityLabel={editMode ? "Done editing widgets" : "Edit widgets"}
            >
              {editMode ? (
                <Icon icon={Check} size={ICON.MD} color="#22c55e" />
              ) : (
                <Icon icon={Pencil} size={ICON.MD} color="#71717a" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isAutoAttach && hasAnyEnabled && activeDashboard && (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.push(`/dashboard-edit/${activeDashboard.id}` as any);
          }}
          className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5 mb-4 border active:opacity-80"
          style={{
            borderColor: `${dashboardColor}55`,
            backgroundColor: `${dashboardColor}14`,
          }}
        >
          <Icon icon={Sparkles} size={ICON.SM} color={dashboardColor} />
          <View className="flex-1">
            <Text className="text-zinc-100 text-xs font-semibold">
              Auto-attach mode
            </Text>
            <Text className="text-zinc-400 text-xs leading-4 mt-0.5">
              This dashboard includes any service or instance you add.
            </Text>
          </View>
          <Text
            className="text-xs font-semibold"
            style={{ color: dashboardColor }}
          >
            Curate
          </Text>
        </Pressable>
      )}

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
            <View className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-2">
              <Text className="text-primary text-sm font-medium text-center">
                Reorder, remove, or add widgets
              </Text>
            </View>
          )}
          {visibleSlots.map((slot, visibleIndex) => {
            const widget = WIDGET_REGISTRY[slot.widgetId];
            if (!widget) return null;
            const { label, settingsComponent } = widget;
            const isFirst = visibleIndex === 0;
            const isLast = visibleIndex === visibleSlots.length - 1;

            return (
              <Animated.View
                key={slot.id}
                entering={FadeInDown.delay(visibleIndex * 80).springify()}
              >
                {showEditControls && (
                  <View className="flex-row items-center justify-between mb-1 px-1">
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
                  </View>
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
                  <WidgetSlotBody widgetId={slot.widgetId} slotId={slot.id} />
                </View>
              </Animated.View>
            );
          })}

          {editMode && (
            <TouchableOpacity
              onPress={openPicker}
              className="flex-row items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-2xl py-4"
            >
              <Icon icon={Plus} size={ICON.MD} color="#a1a1aa" />
              <Text className="text-zinc-300 text-sm font-medium">Add widget</Text>
            </TouchableOpacity>
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
