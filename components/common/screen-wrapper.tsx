import { SafeAreaView, ScrollView, RefreshControl } from "react-native";
import type { ViewProps } from "react-native";

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
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-2 pb-6"
          showsVerticalScrollIndicator={false}
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
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 bg-background px-4 ${className}`} {...props}>
      {children}
    </SafeAreaView>
  );
}
