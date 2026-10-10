import { useRef } from "react";
import { View, Text } from "react-native";
import { AlertTriangle, Download, ExternalLink } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { BottomSheet, SheetTitleRow } from "@/components/ui/bottom-sheet";
import { DetailStat, DetailStatGrid } from "@/components/ui/detail-stat";
import { Button } from "@/components/ui/button";
import { formatBytes, formatReleaseAge } from "@/lib/utils";
import { getQualityColor } from "@/lib/quality-colors";
import { useGrabRadarrRelease } from "@/hooks/use-radarr";
import { useGrabSonarrRelease } from "@/hooks/use-sonarr";
import type { ArrRelease, SonarrRelease } from "@/lib/types";

interface ReleaseDetailSheetProps {
  release: ArrRelease | SonarrRelease | null;
  service: "radarr" | "sonarr";
  instanceId?: string;
  onClose: () => void;
  /**
   * Fired once the sheet's native `<Modal>` is fully gone — the safe point to
   * navigate on iOS (see `useModalClosed`).
   */
  onClosed?: () => void;
}

export function ReleaseDetailSheet({
  release: releaseProp,
  service,
  instanceId,
  onClose,
  onClosed,
}: ReleaseDetailSheetProps) {
  // Keep showing the last release while the sheet animates out.
  const lastRelease = useRef(releaseProp);
  if (releaseProp) lastRelease.current = releaseProp;
  const release = releaseProp ?? lastRelease.current;

  // Both grab hooks coexist so the sheet can be used from either service.
  // Only one will fire per render.
  const radarrGrab = useGrabRadarrRelease(instanceId);
  const sonarrGrab = useGrabSonarrRelease(instanceId);
  const grab = service === "radarr" ? radarrGrab : sonarrGrab;

  function handleGrab() {
    // Closing: the sheet still shows the last release while it animates out,
    // but a tap then must not send (or re-send) the grab.
    if (!releaseProp) return;
    grab.mutate(
      { guid: releaseProp.guid, indexerId: releaseProp.indexerId },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }

  if (!release) {
    return (
      <BottomSheet visible={false} onClose={onClose} onClosed={onClosed} />
    );
  }

  const isTorrent = release.protocol === "torrent";
  const qualityName = release.quality?.quality?.name ?? "Unknown";
  const qualityColor = getQualityColor(qualityName);
  const isProper = (release.quality?.revision?.version ?? 1) > 1;
  const isRepack = release.quality?.revision?.isRepack === true;
  const sonarr = release as SonarrRelease;
  const isSeasonPack = sonarr.fullSeason === true;
  const ageLabel = formatReleaseAge(
    release.age,
    release.ageHours,
    release.ageMinutes,
  );

  return (
    <BottomSheet
      visible={releaseProp !== null}
      onClose={onClose}
      onClosed={onClosed}
      header={
        <SheetTitleRow
          title="Release details"
          subtitle={`${release.indexer} · ${isTorrent ? "Torrent" : "Usenet"}`}
          onClose={onClose}
        />
      }
      footer={
        <Button
          label={
            grab.isPending
              ? "Sending…"
              : release.rejected
                ? "Grab anyway"
                : "Grab"
          }
          onPress={handleGrab}
          variant={release.rejected ? "danger" : "primary"}
          size="lg"
          loading={grab.isPending}
          icon={
            grab.isPending ? undefined : (
              <Icon icon={Download} size={16} color="white" />
            )
          }
        />
      }
    >
      {/* Title */}
      <Text selectable className="text-zinc-100 text-sm leading-5 mb-3">
        {release.title}
      </Text>

      {/* Quality + flags row */}
      <View className="flex-row items-center flex-wrap gap-1.5 mb-4">
        <View
          className="rounded-md px-2 py-1"
          style={{ backgroundColor: qualityColor.bg }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: qualityColor.text }}
          >
            {qualityName}
          </Text>
        </View>
        {isProper && (
          <View
            className="rounded-md px-2 py-1"
            style={{ backgroundColor: "#b45309" }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: "#fffbeb" }}
            >
              PROPER
            </Text>
          </View>
        )}
        {isRepack && (
          <View
            className="rounded-md px-2 py-1"
            style={{ backgroundColor: "#b45309" }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: "#fffbeb" }}
            >
              REPACK
            </Text>
          </View>
        )}
        {isSeasonPack && (
          <View
            className="rounded-md px-2 py-1"
            style={{ backgroundColor: "#5b21b6" }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: "#f5f3ff" }}
            >
              Season Pack
            </Text>
          </View>
        )}
        {(release.languages ?? []).slice(0, 3).map((lang) => (
          <View key={lang.id} className="rounded-md px-2 py-1 bg-surface-light">
            <Text className="text-xs font-medium text-zinc-100">
              {lang.name}
            </Text>
          </View>
        ))}
      </View>

      {/* Stats grid */}
      <DetailStatGrid>
        <DetailStat label="Size" value={formatBytes(release.size)} />
        <DetailStat label="Age" value={ageLabel} />
        {isTorrent && (
          <>
            <DetailStat
              label="Seeders"
              value={String(release.seeders ?? 0)}
              tone={
                (release.seeders ?? 0) === 0
                  ? "danger"
                  : (release.seeders ?? 0) >= 25
                    ? "success"
                    : undefined
              }
            />
            <DetailStat
              label="Leechers"
              value={String(release.leechers ?? 0)}
            />
          </>
        )}
        {release.customFormatScore !== undefined &&
          release.customFormatScore !== 0 && (
            <DetailStat
              label="Format score"
              value={
                release.customFormatScore > 0
                  ? `+${release.customFormatScore}`
                  : String(release.customFormatScore)
              }
              tone={release.customFormatScore < 0 ? "danger" : "success"}
            />
          )}
        {release.releaseGroup && (
          <DetailStat label="Group" value={release.releaseGroup} />
        )}
      </DetailStatGrid>

      {/* Rejection banner */}
      {release.rejected &&
        release.rejections &&
        release.rejections.length > 0 && (
          <View className="bg-red-950/60 border border-red-900 rounded-xl p-3 mb-3">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon icon={AlertTriangle} size={14} color="#fca5a5" />
              <Text className="text-red-200 text-xs font-semibold uppercase tracking-wide">
                Rejected by {service === "radarr" ? "Radarr" : "Sonarr"}
              </Text>
            </View>
            {release.rejections.map((r, i) => (
              <Text key={i} className="text-red-100 text-xs leading-5">
                • {r}
              </Text>
            ))}
          </View>
        )}

      {release.infoUrl && (
        <View className="flex-row items-center gap-1 mb-3">
          <Icon icon={ExternalLink} size={12} color="#71717a" />
          <Text className="text-zinc-500 text-xs flex-1" numberOfLines={1}>
            {release.infoUrl}
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}
