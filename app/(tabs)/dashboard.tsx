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
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useConfigStore } from "@/store/config-store";
import { CardErrorBoundary } from "@/components/common/error-boundary";
import { ICON, type WidgetId } from "@/lib/constants";
import { WIDGET_REGISTRY } from "@/components/dashboard/widget-registry";
import { AddWidgetSheet } from "@/components/dashboard/add-widget-sheet";
import { WidgetSettingsSheet } from "@/components/dashboard/widget-settings-sheet";

export default function DashboardScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  const services = useConfigStore((s) => s.services);
  const dashboardWidgets = useConfigStore((s) => s.dashboardWidgets);
  const removeWidget = useConfigStore((s) => s.removeWidget);
  const moveWidget = useConfigStore((s) => s.moveWidget);
  const [editMode, setEditMode] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [settingsForWidget, setSettingsForWidget] = useState<WidgetId | null>(null);

  const hasAnyEnabled = Object.values(services).some((s) => s.enabled);

  const visibleWidgets = dashboardWidgets.filter((id) => {
    const widget = WIDGET_REGISTRY[id];
    if (!widget) return false;
    return widget.service === null || services[widget.service].enabled;
  });

  function handleMove(id: (typeof dashboardWidgets)[number], direction: "up" | "down") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    moveWidget(id, direction);
  }

  function handleRemove(id: (typeof dashboardWidgets)[number]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeWidget(id);
  }

  function openPicker() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerVisible(true);
  }

  function openSettings(id: WidgetId) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSettingsForWidget(id);
  }

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between mt-2 mb-4">
        <Text className="text-zinc-100 text-2xl font-bold">Dashboarr</Text>
        {hasAnyEnabled && (
          <TouchableOpacity
            onPress={() => setEditMode((e) => !e)}
            className="p-2"
            hitSlop={8}
          >
            {editMode ? (
              <Check size={ICON.MD} color="#22c55e" />
            ) : (
              <Pencil size={ICON.MD} color="#71717a" />
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
          {visibleWidgets.map((id, visibleIndex) => {
            const widget = WIDGET_REGISTRY[id];
            if (!widget) return null;
            const { component: WidgetComponent, label, settingsComponent } = widget;
            const isFirst = visibleIndex === 0;
            const isLast = visibleIndex === visibleWidgets.length - 1;

            return (
              <Animated.View
                key={id}
                entering={FadeInDown.delay(visibleIndex * 80).springify()}
              >
                {editMode && (
                  <Animated.View
                    entering={FadeIn}
                    exiting={FadeOut}
                    className="flex-row items-center justify-between mb-1 px-1"
                  >
                    <View className="flex-row items-center gap-1.5 flex-1">
                      <GripVertical size={ICON.SM} color="#52525b" />
                      <Text className="text-zinc-500 text-xs font-medium" numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <TouchableOpacity
                        onPress={() => handleMove(id, "up")}
                        disabled={isFirst}
                        className="p-1"
                        hitSlop={6}
                      >
                        <ChevronUp size={ICON.MD} color={isFirst ? "#3f3f46" : "#a1a1aa"} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleMove(id, "down")}
                        disabled={isLast}
                        className="p-1"
                        hitSlop={6}
                      >
                        <ChevronDown size={ICON.MD} color={isLast ? "#3f3f46" : "#a1a1aa"} />
                      </TouchableOpacity>
                      {settingsComponent && (
                        <TouchableOpacity
                          onPress={() => openSettings(id)}
                          className="p-1 ml-1"
                          hitSlop={6}
                        >
                          <Settings size={ICON.MD} color="#60a5fa" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => handleRemove(id)}
                        className="p-1 ml-1"
                        hitSlop={6}
                      >
                        <X size={ICON.MD} color="#ef4444" />
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
                    <WidgetComponent />
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
                <Plus size={ICON.MD} color="#a1a1aa" />
                <Text className="text-zinc-300 text-sm font-medium">Add widget</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      )}

      <AddWidgetSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} />
      <WidgetSettingsSheet
        widgetId={settingsForWidget}
        onClose={() => setSettingsForWidget(null)}
      />
    </ScreenWrapper>
  );
}
