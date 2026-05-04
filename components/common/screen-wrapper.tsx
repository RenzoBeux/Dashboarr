import { useContext } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshControl, Platform } from "react-native";
import type { ViewProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { DemoBanner } from "@/components/common/demo-banner";
import { HAS_GLASS_TAB_BAR } from "@/lib/glass";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

const SCROLL_BOTTOM_PADDING = 24;

interface ScreenWrapperProps extends ViewProps {
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function ScreenWrapper({
  scrollable = true,
  refreshing = false,
  onRefresh,
  children,
  className = "",
  ...props
}: ScreenWrapperProps) {
  // When the tab bar is rendered as a floating glass surface (iOS 26+),
  // it's absolutely positioned and screen content scrolls behind it.
  // Compensate by extending content past the bottom inset (handled by the
  // tab bar itself) and padding the scroll view by the full tab bar height.
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const usesFloatingTabBar = HAS_GLASS_TAB_BAR && tabBarHeight !== undefined;
  const safeAreaEdges = usesFloatingTabBar
    ? (["top", "left", "right"] as const)
    : undefined;
  const scrollPaddingBottom =
    SCROLL_BOTTOM_PADDING + (usesFloatingTabBar ? tabBarHeight : 0);

  if (scrollable) {
    return (
      <SafeAreaView
        edges={safeAreaEdges}
        className={`flex-1 bg-background ${className}`}
        {...props}
      >
        <DemoBanner />
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-2"
          contentContainerStyle={{ paddingBottom: scrollPaddingBottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          bottomOffset={20}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#3b82f6"
                colors={["#3b82f6"]}
                progressBackgroundColor="#18181b"
              />
            ) : undefined
          }
        >
          {children}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={safeAreaEdges}
      style={usesFloatingTabBar ? { paddingBottom: tabBarHeight } : undefined}
      className={`flex-1 bg-background px-4 ${className}`}
      {...props}
    >
      <DemoBanner />
      {children}
    </SafeAreaView>
  );
}
