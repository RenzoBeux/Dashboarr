import { SafeAreaView } from "react-native-safe-area-context";
import { RefreshControl, Platform } from "react-native";
import type { ViewProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { DemoBanner } from "@/components/common/demo-banner";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

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
  if (scrollable) {
    return (
      <SafeAreaView className={`flex-1 bg-background ${className}`} {...props}>
        <DemoBanner />
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-2 pb-6"
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
    <SafeAreaView className={`flex-1 bg-background px-4 ${className}`} {...props}>
      <DemoBanner />
      {children}
    </SafeAreaView>
  );
}
