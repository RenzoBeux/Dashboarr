import { Platform } from "react-native";
import { isLiquidGlassSupported } from "@callstack/liquid-glass";

export const HAS_GLASS_TAB_BAR = Platform.OS === "ios" && isLiquidGlassSupported;
