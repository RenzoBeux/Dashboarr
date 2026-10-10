import { View, Text, Pressable, ActivityIndicator } from "react-native";
import {
  ChevronRight,
  MoreHorizontal,
  Search,
  Upload,
  UserSearch,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import { formatBytes } from "@/lib/utils";
import type { SubtitleRow } from "@/lib/subtitle-model";

/**
 * The subtitle list for one movie or episode: one row per subtitle and per
 * missing language, then Search / Manual / Upload, then the language profile.
 *
 * Shared by the movie page's Subtitles card and the episode subtitles sheet,
 * so both behave the same: a missing language gets its own Search (Bazarr
 * searches one language per request), everything that exists gets a "⋯" menu,
 * and Manual sits in the footer because a provider search returns every
 * profile language at once.
 */
export function SubtitlesBlock({
  rows,
  busyKeys,
  onSearchLanguage,
  onRowMenu,
  onSearchAll,
  onManual,
  onUpload,
  profileName,
  onPressProfile,
  hideProfile = false,
  tone = "surface",
}: {
  rows: readonly SubtitleRow[];
  // Rows with a search the app is still waiting on.
  busyKeys?: ReadonlySet<string>;
  onSearchLanguage: (row: SubtitleRow) => void;
  onRowMenu: (row: SubtitleRow) => void;
  onSearchAll: () => void;
  onManual: () => void;
  onUpload: () => void;
  // null = no profile assigned.
  profileName: string | null;
  onPressProfile?: () => void;
  // Episodes inherit their series' profile, which is set on the series.
  hideProfile?: boolean;
  // The surface the block sits on: a card (surface) or a lighter panel
  // inside a sheet (raised), which needs stronger dividers and badge rings.
  tone?: "surface" | "raised";
}) {
  const divider = tone === "raised" ? "border-zinc-700" : "border-zinc-800";
  const ring = tone === "raised" ? "border-surface-light" : "border-surface";
  return (
    <View>
      {rows.length === 0 ? (
        <Text className="text-zinc-500 text-xs px-4 py-3">
          No subtitles yet, and no language profile asks for any.
        </Text>
      ) : (
        rows.map((row) => (
          <SubtitleRowView
            key={row.key}
            row={row}
            busy={busyKeys?.has(row.key) ?? false}
            onSearch={() => onSearchLanguage(row)}
            onMenu={() => onRowMenu(row)}
            divider={divider}
            ring={ring}
          />
        ))
      )}

      <View className={`flex-row gap-2 px-3 py-2.5 border-t ${divider}`}>
        <ToolButton icon={Search} label="Search" onPress={onSearchAll} />
        <ToolButton icon={UserSearch} label="Manual" onPress={onManual} />
        <ToolButton icon={Upload} label="Upload" onPress={onUpload} />
      </View>

      {hideProfile ? null : (
        <Pressable
          onPress={onPressProfile}
          disabled={!onPressProfile}
          className={`flex-row items-center justify-between px-4 py-3 border-t ${divider} active:opacity-70`}
          accessibilityRole="button"
          accessibilityLabel={`Language profile: ${profileName ?? "none"}`}
        >
          <Text className="text-zinc-500 text-xs">Language profile</Text>
          <View className="flex-row items-center gap-1">
            <Text className="text-zinc-200 text-xs">
              {profileName ?? "None"}
            </Text>
            {onPressProfile ? (
              <Icon icon={ChevronRight} size={14} color="#71717a" />
            ) : null}
          </View>
        </Pressable>
      )}
    </View>
  );
}

function SubtitleRowView({
  row,
  busy,
  onSearch,
  onMenu,
  divider,
  ring,
}: {
  row: SubtitleRow;
  busy: boolean;
  onSearch: () => void;
  onMenu: () => void;
  divider: string;
  ring: string;
}) {
  const missing = row.state === "missing";
  return (
    <View className={`flex-row items-center gap-3 px-4 py-2.5 border-t ${divider}`}>
      <SubtitleTrackChip
        code={row.code2}
        name={row.name}
        state={row.state}
        forced={row.forced}
        hi={row.hi}
        ringClassName={ring}
      />
      <View className="flex-1 min-w-0">
        <Text
          className={`text-sm font-semibold ${
            row.state === "embedded" ? "text-zinc-400" : "text-zinc-100"
          }`}
          numberOfLines={1}
        >
          {row.name}
        </Text>
        <Text
          className={`text-xs mt-0.5 ${
            missing
              ? "text-orange-400"
              : row.state === "embedded"
                ? "text-zinc-500"
                : "text-zinc-400"
          }`}
          numberOfLines={1}
        >
          {busy && missing ? "Searching…" : describeRow(row)}
        </Text>
      </View>
      {missing ? (
        <Pressable
          onPress={onSearch}
          disabled={busy}
          className={`flex-row items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 ${
            busy ? "opacity-60" : "active:opacity-80"
          }`}
          accessibilityRole="button"
          accessibilityLabel={`Search ${row.name} subtitles`}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Icon icon={Search} size={13} color="#fff" themed={false} />
          )}
          <Text className="text-white text-xs font-semibold">Search</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onMenu}
          hitSlop={8}
          className="p-1.5 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={`${row.name} subtitle actions`}
        >
          <Icon icon={MoreHorizontal} size={18} color="#a1a1aa" />
        </Pressable>
      )}
    </View>
  );
}

function ToolButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentType<any>;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface-light py-2 active:opacity-70"
      accessibilityRole="button"
    >
      <Icon icon={icon} size={14} color="#d4d4d8" />
      <Text className="text-zinc-200 text-xs font-semibold">{label}</Text>
    </Pressable>
  );
}

/** "Forced · External · SRT · 84 KB", "Embedded track 4", "Missing". */
export function describeRow(row: SubtitleRow): string {
  const parts: string[] = [];
  if (row.forced) parts.push("Forced");
  if (row.hi) parts.push("Hearing impaired");
  if (row.state === "missing") {
    parts.push("Missing");
  } else if (row.state === "embedded") {
    const track = row.sub?.embedded_track_id;
    parts.push(track != null ? `Embedded track ${track}` : "Embedded");
  } else {
    parts.push("External");
    const ext = row.sub?.path?.match(/\.([a-z0-9]+)$/i)?.[1];
    if (ext) parts.push(ext.toUpperCase());
    if (row.sub?.file_size) parts.push(formatBytes(row.sub.file_size));
  }
  return parts.join(" · ");
}
