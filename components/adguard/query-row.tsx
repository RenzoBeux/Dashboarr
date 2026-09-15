import { Pressable, Text, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { formatLogTime, queryReasonMeta } from "@/lib/adguard-format";
import type { AdguardQueryLogItem } from "@/lib/types";

interface QueryRowProps {
  query: AdguardQueryLogItem;
  onPress?: () => void;
}

/**
 * One DNS query. Shared by the live log screen and the tab's preview card so
 * the two always render a query the same way. Mirrors
 * components/pihole/query-row.tsx, on AGH's shape instead of Pi-hole's.
 */
export function QueryRow({ query, onPress }: QueryRowProps) {
  const meta = queryReasonMeta(query.reason);
  const client = query.client_info?.name || query.client || "unknown";
  const elapsed = Number(query.elapsedMs);

  const body = (
    <View className="flex-row items-start gap-2">
      <View className={`w-1.5 h-1.5 rounded-full mt-1.5 ${meta.dotClass}`} />
      <View className="flex-1 min-w-0">
        <Text className="text-zinc-200 text-sm" numberOfLines={1}>
          {query.question.name}
        </Text>
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-zinc-500 text-xs" numberOfLines={1}>
            {client}
          </Text>
          <Text className="text-zinc-600 text-xs">{query.question.type}</Text>
          {/* An exact clock time, not "2m ago" — this is a live log. */}
          <Text className="text-zinc-600 text-xs">{formatLogTime(query.time)}</Text>
          {Number.isFinite(elapsed) && elapsed > 0 ? (
            <Text className="text-zinc-600 text-xs">{elapsed.toFixed(1)}ms</Text>
          ) : null}
          {query.cached ? <Text className="text-zinc-600 text-xs">cached</Text> : null}
        </View>
      </View>
      <Badge label={meta.label} variant={meta.badgeVariant} />
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} className="active:opacity-70">
      {body}
    </Pressable>
  );
}
