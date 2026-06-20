import { useState, type ComponentType, type ReactNode } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ErrorBanner } from "@/components/common/error-banner";
import { ICON } from "@/lib/constants";

interface SearchSectionProps {
  /** Category label, e.g. "Movies". */
  title: string;
  /** Lucide icon for the category. */
  icon: ComponentType<{ size?: number; color?: string }>;
  /** Right-aligned source label, e.g. "Radarr". */
  serviceLabel: string;
  /** Total number of matches (drives the count + the "Show all" affordance). */
  total: number;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  /** True when there are more matches than the preview renders. */
  hasMore?: boolean;
  /** Deep-link into the dedicated per-service search screen. */
  onShowAll?: () => void;
  defaultExpanded?: boolean;
  /** The (preview-capped) result rows. */
  children?: ReactNode;
}

/**
 * Collapsible category section shared by every global-search section. Renders
 * its own header (chevron + icon + label + count + inline spinner + source
 * label), an inline ErrorBanner on failure, a compact "No matches" line once it
 * settles empty (so the user can see every service was searched), and a
 * "Show all (N)" deep-link when there are more matches than the preview.
 */
export function SearchSection({
  title,
  icon,
  serviceLabel,
  total,
  isLoading,
  isError,
  error,
  hasMore = false,
  onShowAll,
  defaultExpanded = true,
  children,
}: SearchSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const settledEmpty = !isLoading && !isError && total === 0;

  return (
    <View className="mb-5">
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        className="flex-row items-center gap-2 mb-2 active:opacity-70"
        hitSlop={6}
      >
        <Icon icon={expanded ? ChevronDown : ChevronRight} size={ICON.SM} color="#71717a" />
        <Icon icon={icon} size={ICON.SM} color="#a1a1aa" />
        <Text className="text-zinc-200 text-sm font-semibold">{title}</Text>
        {total > 0 && <Text className="text-zinc-500 text-xs">({total})</Text>}
        {isLoading && (
          <View className="ml-1">
            <ActivityIndicator size="small" color="#71717a" />
          </View>
        )}
        <View className="flex-1" />
        <Text className="text-zinc-600 text-xs">{serviceLabel}</Text>
      </Pressable>

      {expanded &&
        (isError ? (
          <ErrorBanner error={error} title={`Couldn't search ${serviceLabel}`} />
        ) : settledEmpty ? (
          <Text className="text-zinc-600 text-xs px-1 pb-1">No matches</Text>
        ) : (
          <View className="gap-2">
            {children}
            {hasMore && onShowAll && (
              <Pressable onPress={onShowAll} className="py-1.5 active:opacity-70" hitSlop={4}>
                <Text className="text-primary text-sm font-medium">
                  Show all {total} →
                </Text>
              </Pressable>
            )}
          </View>
        ))}
    </View>
  );
}
