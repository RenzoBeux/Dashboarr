import { createElement } from "react";
import type { ComponentType } from "react";
import { useUiScale } from "@/hooks/use-ui-scale";
import { useThemeColor } from "@/hooks/use-theme-color";

// Wraps a lucide-react-native icon so its `size` prop scales with uiScale and
// its `color` / `fill` follow the app theme (a dark-chrome palette hex like
// "#a1a1aa" darkens under the Light theme, see lib/theme-palette.ts). Pass
// `themed={false}` for an icon sitting on a fixed-color fill (a solid accent
// chip or badge) whose color must not change with the theme.
// Typed loosely on purpose — any component that accepts a numeric size works,
// and trying to be precise here fights with React.ElementType / lucide's
// generic ForwardRef type at every call site.
type IconProps = Record<string, unknown> & {
  icon: ComponentType<any>;
  size: number;
  themed?: boolean;
};

export function Icon({ icon, size, themed = true, ...rest }: IconProps) {
  const scale = useUiScale();
  const tc = useThemeColor();
  const props: Record<string, unknown> = { ...rest, size: Math.round(size * scale) };
  if (themed) {
    if (typeof rest.color === "string") props.color = tc(rest.color);
    if (typeof rest.fill === "string") props.fill = tc(rest.fill);
  }
  return createElement(icon, props);
}
