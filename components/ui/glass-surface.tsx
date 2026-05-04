import { Platform, View, type ViewProps } from "react-native";
import {
  LiquidGlassView,
  isLiquidGlassSupported,
} from "@callstack/liquid-glass";

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
  if (USE_GLASS) {
    return (
      <LiquidGlassView
        effect={effect}
        colorScheme="dark"
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
