import { Children, isValidElement } from "react";
import type { ReactNode } from "react";
import { View, Text } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

const CARD_SHADOW: StyleProp<ViewStyle> = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  elevation: 3,
};

interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function SettingsGroup({
  title,
  children,
  footer,
  className = "",
}: SettingsGroupProps) {
  const items = Children.toArray(children).filter(
    (child) => isValidElement(child) || typeof child === "string",
  );

  return (
    <View className={`mb-6 ${className}`}>
      {title ? (
        <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
          {title}
        </Text>
      ) : null}
      <View
        className="bg-surface rounded-2xl border border-border overflow-hidden"
        style={CARD_SHADOW}
      >
        {items.map((child, i) => (
          <View
            key={i}
            className={i === 0 ? "" : "border-t border-border"}
          >
            {child}
          </View>
        ))}
      </View>
      {footer ? (
        <Text className="text-zinc-600 text-xs text-center mt-2">{footer}</Text>
      ) : null}
    </View>
  );
}
