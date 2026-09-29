import { Platform, View, type ViewProps } from "react-native";
import {
  LiquidGlassView,
  isLiquidGlassSupported,
} from "@callstack/liquid-glass";
import { useAppTheme } from "@/hooks/use-app-theme";

const USE_GLASS = Platform.OS === "ios" && isLiquidGlassSupported;

export interface GlassSurfaceProps extends ViewProps {
  effect?: "clear" | "regular" | "none";
  tintColor?: string;
  fallbackClassName?: string;
}

export function GlassSurface({
  effect = "regular",
  tintColor,
  fallbackClassName = "bg-surface",
  className,
  children,
  ...rest
}: GlassSurfaceProps) {
  const { scheme } = useAppTheme();
  if (USE_GLASS) {
    return (
      <LiquidGlassView
        effect={effect}
        colorScheme={scheme}
        tintColor={tintColor}
        className={className}
        {...rest}
      >
        {children}
      </LiquidGlassView>
    );
  }

  const composed = className ? `${fallbackClassName} ${className}` : fallbackClassName;
  return (
    <View className={composed} {...rest}>
      {children}
    </View>
  );
}
