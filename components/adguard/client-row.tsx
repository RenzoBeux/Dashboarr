import { Pressable, Text, View } from "react-native";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { formatLeaseExpiry, type AdguardClientRow, type AdguardClientSource } from "@/lib/adguard-clients";

interface ClientRowProps {
  row: AdguardClientRow;
  onPress?: () => void;
}

const SOURCE_META: Record<AdguardClientSource, { label: string; variant: BadgeVariant }> = {
  configured: { label: "Configured", variant: "info" },
  dhcp: { label: "DHCP", variant: "success" },
  auto: { label: "Discovered", variant: "default" },
};

/**
 * One device. Name, then every identifier the merge found for it, then
 * what we know about its lease. Shared by the Clients screen and the tab's
 * preview card so a client always renders the same way.
 */
export function ClientRow({ row, onPress }: ClientRowProps) {
  const meta = SOURCE_META[row.source];
  const ids = [...row.ips, ...row.macs, ...row.otherIds];
  const expiry = row.lease ? formatLeaseExpiry(row.lease.expires) : null;
  const details: string[] = [];
  if (row.lease?.static) details.push("static lease");
  else if (expiry) details.push(expiry);
  if (row.lease?.hostname && row.lease.hostname !== row.name) details.push(row.lease.hostname);
  if (row.source === "auto" && row.discoveredBy) details.push(`via ${row.discoveredBy}`);
  if (row.configured && row.configured.use_global_settings === false) details.push("custom settings");
  if (row.configured && row.configured.use_global_blocked_services === false) {
    const n = row.configured.blocked_services?.length ?? 0;
    details.push(n > 0 ? `${n} blocked service${n === 1 ? "" : "s"}` : "no blocked services");
  }

  const body = (
    <View className="flex-row items-start gap-3">
      <View className="flex-1 min-w-0">
        <Text className="text-zinc-100 text-sm font-medium" numberOfLines={1}>
          {row.name}
        </Text>
        {ids.length > 0 ? (
          <Text className="text-zinc-500 text-xs font-mono" numberOfLines={1}>
            {ids.join("  ·  ")}
          </Text>
        ) : null}
        {details.length > 0 ? (
          <Text className="text-zinc-600 text-xs" numberOfLines={1}>
            {details.join("  ·  ")}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-1">
        <Badge label={meta.label} variant={meta.variant} />
        {row.queries !== undefined ? (
          <Text className="text-zinc-400 text-xs">{row.queries.toLocaleString()} queries</Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} className="active:opacity-70">
      {body}
    </Pressable>
  );
}
