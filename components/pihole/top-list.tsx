import { Text, View } from "react-native";
import { ProgressBar } from "@/components/ui/progress-bar";

export interface TopListRow {
  /** Primary label — a domain, or a client's hostname. */
  title: string;
  /** Optional second line, e.g. a client's IP when it also has a name. */
  subtitle?: string;
  count: number;
}

interface TopListProps {
  rows: readonly TopListRow[];
  /** Set for blocked domains so the bars match the red used everywhere else. */
  blocked?: boolean;
}

/**
 * A ranked "name + count + bar" list.
 *
 * Lifted from the TopUsers block in app/tautulli-stats.tsx — same shape, and
 * shared by the Pi-hole screen's top-domains/top-clients card and the
 * pihole-top-blocked dashboard widget so the two cannot drift.
 *
 * Bars are relative to the largest row, not to the total: with a long tail of
 * small counts, scaling to the total leaves every bar invisible.
 */
export function TopList({ rows, blocked = false }: TopListProps) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <View className="gap-3">
      {rows.map((row) => (
        <View key={`${row.title}-${row.subtitle ?? ""}`} className="gap-1">
          <View className="flex-row items-baseline justify-between">
            <Text
              className="text-zinc-200 text-sm flex-1 mr-2"
              numberOfLines={1}
            >
              {row.title}
            </Text>
            <Text className="text-zinc-400 text-xs">
              {row.count.toLocaleString()}
            </Text>
          </View>
          {row.subtitle ? (
            <Text className="text-zinc-600 text-xs" numberOfLines={1}>
              {row.subtitle}
            </Text>
          ) : null}
          <ProgressBar
            progress={row.count / max}
            fillColor={blocked ? "#ef4444" : undefined}
          />
        </View>
      ))}
    </View>
  );
}
