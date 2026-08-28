import { ShieldAlert } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { formatLogTime, queryStatusMeta } from "@/lib/pihole-format";
import type { PiholeQuery } from "@/lib/types";

interface QueryRowProps {
  query: PiholeQuery;
  onPress?: () => void;
}

/**
 * One DNS query. Shared by the live log screen and the tab's preview card so
 * the two always render a query the same way.
 */
export function QueryRow({ query, onPress }: QueryRowProps) {
  const meta = queryStatusMeta(query.status);
  const client = query.client?.name || query.client?.ip || "unknown";
  const replyMs = query.reply?.time;

  const body = (
    <View className="flex-row items-start gap-2">
      <View className={`w-1.5 h-1.5 rounded-full mt-1.5 ${meta.dotClass}`} />
      <View className="flex-1 min-w-0">
        <Text className="text-zinc-200 text-sm" numberOfLines={1}>
          {query.domain}
        </Text>
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-zinc-500 text-xs" numberOfLines={1}>
            {client}
          </Text>
          <Text className="text-zinc-600 text-xs">{query.type}</Text>
          {/* An exact clock time, not "2m ago" — this is a live log. */}
          <Text className="text-zinc-600 text-xs">{formatLogTime(query.time)}</Text>
          {typeof replyMs === "number" && replyMs > 0 ? (
            <Text className="text-zinc-600 text-xs">{Math.round(replyMs)}ms</Text>
          ) : null}
          {/* Deep CNAME inspection blocked this via a different domain, which is
              otherwise invisible and looks like a false positive. */}
          {query.cname ? (
            <Text className="text-zinc-600 text-xs" numberOfLines={1}>
              via {query.cname}
            </Text>
          ) : null}
        </View>
      </View>
      {query.dnssec === "BOGUS" ? (
        <Icon icon={ShieldAlert} size={12} color="#f59e0b" />
      ) : null}
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
