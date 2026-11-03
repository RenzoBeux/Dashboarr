import { View, Text } from "react-native";
import { Check, X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

export type DetailStatTone = "success" | "danger";

/**
 * Label + value cell for the stats grid in detail sheets (release, subtitle
 * result, history entry). Half width, so two sit side by side inside a
 * `flex-row flex-wrap` container.
 */
export function DetailStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: DetailStatTone;
}) {
  const valueClass =
    tone === "success"
      ? "text-emerald-400"
      : tone === "danger"
        ? "text-red-400"
        : "text-zinc-100";
  return (
    <View className="w-1/2 mb-2">
      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">
        {label}
      </Text>
      <Text
        className={`${valueClass} text-sm font-medium mt-0.5`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** The stats grid container `DetailStat` cells sit in. */
export function DetailStatGrid({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-surface-light/60 rounded-xl p-3 mb-3">
      <View className="flex-row flex-wrap">{children}</View>
    </View>
  );
}

/**
 * What a candidate matched and didn't match (subtitle provider results and
 * Bazarr history both report these as lists of attribute names such as
 * "release_group" or "resolution"). Matched items read as green checks,
 * misses as red crosses; an empty side is omitted.
 */
export function MatchList({
  matched,
  missed,
}: {
  matched: readonly string[];
  missed: readonly string[];
}) {
  if (matched.length === 0 && missed.length === 0) return null;
  return (
    <View className="gap-2 mb-3">
      {matched.length > 0 ? (
        <MatchRow label="Matched" items={matched} matched />
      ) : null}
      {missed.length > 0 ? (
        <MatchRow label="Didn't match" items={missed} matched={false} />
      ) : null}
    </View>
  );
}

function MatchRow({
  label,
  items,
  matched,
}: {
  label: string;
  items: readonly string[];
  matched: boolean;
}) {
  return (
    <View>
      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wide mb-1.5">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {items.map((item) => (
          <View
            key={item}
            className={`flex-row items-center gap-1 rounded-md px-2 py-1 ${
              matched ? "bg-emerald-500/15" : "bg-red-500/15"
            }`}
          >
            <Icon
              icon={matched ? Check : X}
              size={12}
              color={matched ? "#34d399" : "#f87171"}
            />
            <Text
              className={`text-xs font-medium ${
                matched ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {humanizeMatch(item)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Provider match keys arrive snake_case ("release_group", "hearing_impaired").
function humanizeMatch(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
