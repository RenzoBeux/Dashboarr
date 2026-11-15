import { View, Pressable, ScrollView } from "react-native";
import { LayoutGrid, List } from "lucide-react-native";
import { ServiceHeader } from "@/components/common/service-header";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { lightHaptic } from "@/lib/haptics";
import type { LibraryViewMode } from "@/store/library-view-store";
import type { ServiceId } from "@/lib/constants";

/**
 * The header of a library screen: the service title (with instance picker and
 * status), optional segments next to it (Library / History), and icon
 * buttons on the right: screen-specific actions (Add, Scan…) and the
 * list/poster switch. The library search is not here: it is the
 * always-visible LibrarySearchField below the header, so a magnifier up here
 * only ever means "add".
 *
 * Shared by the Bazarr tab and the Radarr/Sonarr libraries.
 */
export function LibraryToolbar<S extends string>({
  title,
  serviceId,
  online,
  segments,
  view,
  actions,
}: {
  title: string;
  serviceId?: ServiceId;
  online?: boolean;
  segments?: {
    options: readonly { value: S; label: string }[];
    value: S;
    onChange: (next: S) => void;
  };
  view?: { mode: LibraryViewMode; onToggle: () => void };
  // Extra icon buttons, before the view switch (e.g. Add, Scan).
  actions?: React.ReactNode;
}) {
  return (
    <View>
      <View className="flex-row items-center gap-2">
        <View className="flex-shrink min-w-0">
          <ServiceHeader
            name={title}
            online={online}
            serviceId={serviceId}
            className="flex-shrink"
          />
        </View>
        {segments ? (
          // Scrolls instead of clipping when the title, instance name and
          // segments outgrow the row (long names, uiScale 1.3).
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // mb-2 lines the chips up with the title, which ServiceHeader
            // offsets with its own mt-2 mb-4.
            // min-w keeps at least one segment visible (scrollable to the
            // rest) when the title and instance name fill the row.
            className="flex-1 mb-2 min-w-[6.5rem]"
            contentContainerClassName="gap-1.5 items-center"
          >
            {segments.options.map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                selected={segments.value === o.value}
                // Re-tapping the current segment is not a switch (callers
                // reset search on a switch).
                onPress={() => {
                  if (o.value !== segments.value) segments.onChange(o.value);
                }}
              />
            ))}
          </ScrollView>
        ) : (
          <View className="flex-1" />
        )}
        <View className="flex-row items-center gap-1.5 flex-shrink-0">
          {actions}
          {view ? (
            <ToolbarIconButton
              icon={view.mode === "list" ? LayoutGrid : List}
              label={view.mode === "list" ? "Show posters" : "Show list"}
              onPress={() => {
                lightHaptic();
                view.onToggle();
              }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** A square icon button for the toolbar's right-hand cluster. */
export function ToolbarIconButton({
  icon,
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  icon: React.ComponentType<any>;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className={`w-9 h-9 rounded-xl items-center justify-center active:opacity-70 mb-2 ${
        active ? "bg-primary/15" : "bg-surface"
      }`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
    >
      <Icon icon={icon} size={18} color={active ? "#60a5fa" : "#d4d4d8"} />
    </Pressable>
  );
}
