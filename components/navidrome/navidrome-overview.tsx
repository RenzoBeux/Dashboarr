import { View, Text, Pressable } from "react-native";
import { FolderSearch, RefreshCw, Trash2, TriangleAlert } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { MediaStatsStrip, type MediaStat } from "@/components/common/media-stats-strip";
import { NavidromeNowPlayingRow } from "@/components/navidrome/navidrome-now-playing-row";
import { toast, toastError } from "@/components/ui/toast";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import {
  useNavidromeDeleteMissing,
  useNavidromeNowPlaying,
  useNavidromeOverview,
  useNavidromeStartScan,
} from "@/hooks/use-navidrome";
import { ICON } from "@/lib/constants";
import { formatBytes, formatRuntime, formatTimeAgo } from "@/lib/utils";
import { mediumHaptic } from "@/lib/haptics";

/**
 * Overview tab: library counters, live playback, and the maintenance actions.
 *
 * Two things are admin-gated upstream and are reflected honestly rather than
 * hidden: `startScan` is behind Subsonic's adminOnly and `/api/library` behind
 * the native API's adminOnlyMiddleware. A non-admin account still gets track,
 * folder, artist and album counts from ungated Subsonic calls, so the screen
 * degrades instead of erroring — but total size, the missing count and both
 * maintenance actions are unavailable, and the card says so.
 */
export function NavidromeOverview({ instanceId }: { instanceId?: string }) {
  // Every query below is gated on a resolved instance, so when this is null
  // there is nothing to render an instance-scoped cover-art URL for anyway.
  const { instanceId: resolvedInstanceId } = useInstanceTarget("navidrome", instanceId);
  const overview = useNavidromeOverview(instanceId);
  const nowPlaying = useNavidromeNowPlaying(instanceId);
  const startScan = useNavidromeStartScan(instanceId);
  const deleteMissing = useNavidromeDeleteMissing(instanceId);

  // ConfirmModal chains are always owned by a flow, never by hand-wired state
  // (the iOS modal-sequencing rule): a quick scan resolving faster than the
  // dismiss animation is exactly the race that hangs Fabric's JS thread.
  const flow = useModalFlow<{ quickScan: void; fullScan: void; deleteMissing: void }>();

  const summary = overview.data?.summary;
  const isAdmin = overview.data?.isAdmin ?? false;

  const stats: MediaStat[] = [
    { label: "Artists", value: summary?.artists?.toLocaleString() ?? "—" },
    { label: "Albums", value: summary?.albums?.toLocaleString() ?? "—" },
    { label: "Tracks", value: summary?.songs?.toLocaleString() ?? "—" },
    {
      label: "Size",
      value: summary?.sizeBytes !== null && summary?.sizeBytes !== undefined
        ? formatBytes(summary.sizeBytes)
        : "—",
    },
  ];

  const runScan = (full: boolean) => {
    flow.close();
    startScan.mutate(full, {
      onSuccess: () => toast(full ? "Full scan started" : "Quick scan started"),
      onError: (err) => toastError("Couldn't start the scan", err),
    });
  };

  const runDeleteMissing = () => {
    flow.close();
    deleteMissing.mutate(undefined, {
      onSuccess: () => toast("Missing files removed"),
      onError: (err) => toastError("Couldn't remove missing files", err),
    });
  };

  const missing = summary?.missing ?? 0;
  const scanning = summary?.scanning ?? false;

  return (
    <View className="gap-4">
      {overview.error ? (
        <ErrorBanner error={overview.error} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Library</CardTitle>
          {scanning ? (
            <Badge label="Scanning" variant="warning" />
          ) : summary?.lastScanAt ? (
            <Text className="text-zinc-500 text-xs">
              Scanned {formatTimeAgo(summary.lastScanAt)}
            </Text>
          ) : null}
        </CardHeader>

        {overview.isLoading ? (
          <SkeletonCardContent rows={2} />
        ) : (
          <View className="gap-2">
            <MediaStatsStrip stats={stats} />
            <View className="flex-row flex-wrap gap-x-4">
              {summary?.durationSec ? (
                <Text className="text-zinc-500 text-xs">
                  {formatRuntime(Math.round(summary.durationSec / 60))} of music
                </Text>
              ) : null}
              {summary?.folders !== null && summary?.folders !== undefined ? (
                <Text className="text-zinc-500 text-xs">
                  {summary.folders.toLocaleString()} folders
                </Text>
              ) : null}
            </View>
            {summary?.source === "scanStatus" && (
              <Text className="text-zinc-600 text-xs">
                {isAdmin
                  ? "Couldn't read library details from Navidrome's admin API, so size and missing files are unavailable."
                  : "Library size and missing files need a Navidrome admin account."}
              </Text>
            )}
          </View>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Now Playing</CardTitle>
          {(nowPlaying.data?.length ?? 0) > 0 && (
            <Badge
              label={`${nowPlaying.data!.length} stream${nowPlaying.data!.length !== 1 ? "s" : ""}`}
              variant="success"
            />
          )}
        </CardHeader>
        {nowPlaying.isLoading ? (
          <SkeletonCardContent rows={1} />
        ) : (nowPlaying.data?.length ?? 0) === 0 ? (
          <EmptyState compact title="Nothing playing" />
        ) : (
          <View className="gap-2">
            {nowPlaying.data!.map((entry) => (
              <NavidromeNowPlayingRow
                key={`${entry.playerId}:${entry.id}`}
                entry={entry}
                instanceId={resolvedInstanceId ?? ""}
              />
            ))}
          </View>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maintenance</CardTitle>
          {missing > 0 && <Badge label={`${missing} missing`} variant="error" />}
        </CardHeader>

        {!isAdmin ? (
          <View className="flex-row items-start gap-2">
            <Icon icon={TriangleAlert} size={ICON.SM} color="#a1a1aa" />
            <Text className="text-zinc-400 text-sm flex-1 leading-5">
              Scanning and removing missing files require a Navidrome admin
              account. Sign in with one to enable these actions.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            <MaintenanceRow
              icon={RefreshCw}
              label="Quick scan"
              description="Scan changed files only"
              busy={startScan.isPending && startScan.variables === false}
              disabled={scanning || startScan.isPending}
              onPress={() => {
                mediumHaptic();
                flow.open("quickScan");
              }}
            />
            <MaintenanceRow
              icon={FolderSearch}
              label="Full scan"
              description="Re-read every file in the library"
              busy={startScan.isPending && startScan.variables === true}
              disabled={scanning || startScan.isPending}
              onPress={() => {
                mediumHaptic();
                flow.open("fullScan");
              }}
            />
            <MaintenanceRow
              icon={Trash2}
              label="Delete missing"
              description={
                missing > 0
                  ? `Remove ${missing} track${missing !== 1 ? "s" : ""} that are gone from disk`
                  : "Nothing is currently marked missing"
              }
              danger
              busy={deleteMissing.isPending}
              disabled={missing === 0 || deleteMissing.isPending}
              onPress={() => {
                mediumHaptic();
                flow.open("deleteMissing");
              }}
            />
          </View>
        )}
      </Card>

      <ConfirmModal
        {...flow.bind("quickScan")}
        title="Quick scan"
        message="Navidrome will scan for files that changed since the last scan. This is usually fast."
        icon={RefreshCw}
        confirmLabel="Scan"
        onConfirm={() => runScan(false)}
      />
      <ConfirmModal
        {...flow.bind("fullScan")}
        title="Full scan"
        message="Navidrome will re-read every file in the library and refresh all metadata. On a large library this can take a long time and load the server heavily."
        icon={FolderSearch}
        confirmLabel="Full scan"
        onConfirm={() => runScan(true)}
      />
      <ConfirmModal
        {...flow.bind("deleteMissing")}
        title="Delete missing files?"
        message={`Permanently remove ${missing} track${missing !== 1 ? "s" : ""} that Navidrome can no longer find on disk, along with their ratings, play counts and playlist entries. This can't be undone, and the files themselves are not touched.`}
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={runDeleteMissing}
      />
    </View>
  );
}

function MaintenanceRow({
  icon,
  label,
  description,
  danger,
  busy,
  disabled,
  onPress,
}: {
  icon: React.ComponentType<any>;
  label: string;
  description: string;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center gap-3 rounded-xl bg-surface-light border border-border px-3 py-3 ${
        disabled || busy ? "opacity-50" : "active:opacity-70"
      }`}
    >
      <Icon icon={icon} size={ICON.MD} color={danger ? "#ef4444" : "#a1a1aa"} />
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${danger ? "text-red-400" : "text-zinc-200"}`}>
          {label}
        </Text>
        <Text className="text-zinc-500 text-xs">{description}</Text>
      </View>
    </Pressable>
  );
}
