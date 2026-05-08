import { createElement } from "react";
import type { ComponentType } from "react";
import { useUiScale } from "@/hooks/use-ui-scale";

// Wraps a lucide-react-native icon so its `size` prop scales with uiScale.
// Typed loosely on purpose — any component that accepts a numeric size works,
// and trying to be precise here fights with React.ElementType / lucide's
// generic ForwardRef type at every call site.
type IconProps = Record<string, unknown> & {
  icon: ComponentType<any>;
  size: number;
};

export function Icon({ icon, size, ...rest }: IconProps) {
  const scale = useUiScale();
  return createElement(icon, { ...rest, size: Math.round(size * scale) });
}
