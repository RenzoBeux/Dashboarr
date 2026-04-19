import { useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";
import { SheetHeader } from "@/components/ui/sheet-header";
import { lightHaptic } from "@/lib/haptics";

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
}

interface SelectProps<T extends string | number> {
  label: string;
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  containerClassName?: string;
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  containerClassName = "",
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View className={containerClassName}>
      <Text className="text-zinc-400 text-sm mb-1.5">{label}</Text>
      <Pressable
        onPress={() => {
          if (disabled) return;
          lightHaptic();
          setOpen(true);
        }}
        disabled={disabled}
        className={`flex-row items-center justify-between bg-surface-light border border-border rounded-xl px-4 py-3 ${
          disabled ? "opacity-50" : "active:opacity-70"
        }`}
      >
        <Text
          className={`text-base flex-1 ${
            selected ? "text-zinc-100" : "text-zinc-500"
          }`}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color="#71717a" />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-background">
          <SheetHeader title={label} onClose={() => setOpen(false)} />
          <ScrollView contentContainerClassName="py-2">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={String(option.value)}
                  onPress={() => {
                    lightHaptic();
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex-row items-center px-4 py-3 active:bg-surface-light"
                >
                  <View className="flex-1 mr-3">
                    <Text
                      className={`text-base ${
                        isSelected ? "text-primary font-semibold" : "text-zinc-100"
                      }`}
                    >
                      {option.label}
                    </Text>
                    {option.description && (
                      <Text className="text-zinc-500 text-xs mt-0.5">
                        {option.description}
                      </Text>
                    )}
                  </View>
                  {isSelected && <Check size={18} color="#3b82f6" />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
