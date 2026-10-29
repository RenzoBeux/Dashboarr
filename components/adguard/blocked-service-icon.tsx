import { useMemo } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Shield } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useUiScale } from "@/hooks/use-ui-scale";
import { decodeServiceIcon } from "@/lib/adguard-blocked-services";

interface BlockedServiceIconProps {
  /** Base64 SVG from the catalog. */
  iconB64: string | undefined;
  size: number;
  color?: string;
}

/**
 * A catalog icon. Every icon AGH ships is drawn with `currentColor`, so
 * the SVG takes its colour from the `color` prop, mirrored for the Light
 * theme like any other hex. Falls back to a shield when the Base64 does
 * not decode to an SVG. `size` is a numeric prop on a third-party
 * component, so it is scaled here with useUiScale.
 */
export function BlockedServiceIcon({ iconB64, size, color = "#a1a1aa" }: BlockedServiceIconProps) {
  const tc = useThemeColor();
  const uiScale = useUiScale();
  const xml = useMemo(() => decodeServiceIcon(iconB64), [iconB64]);
  const px = size * uiScale;
  if (!xml) return <Icon icon={Shield} size={size} color={color} />;
  return (
    <View style={{ width: px, height: px }}>
      <SvgXml xml={xml} width={px} height={px} color={tc(color)} />
    </View>
  );
}
