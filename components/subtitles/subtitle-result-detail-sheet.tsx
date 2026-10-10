import { useRef } from "react";
import { View, Text } from "react-native";
import { Download, ExternalLink } from "lucide-react-native";
import { BottomSheet, SheetTitleRow } from "@/components/ui/bottom-sheet";
import { DetailStat, DetailStatGrid, MatchList } from "@/components/ui/detail-stat";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import { ScoreBadge } from "@/components/subtitles/subtitle-result-item";
import { normalizeLanguage } from "@/lib/language-codes";
import type { BazarrSubtitleResult } from "@/lib/types";

/**
 * Details of one manual-search candidate (every release name it matches, what
 * matched and what didn't, uploader, link) with a Download button. Built on
 * the shared BottomSheet, so it reports onClosed and can be a flow step.
 */
export function SubtitleResultDetailSheet({
  result: resultProp,
  downloading,
  onDownload,
  onClose,
  onClosed,
}: {
  // null = closed.
  result: BazarrSubtitleResult | null;
  downloading: boolean;
  onDownload: (r: BazarrSubtitleResult) => void;
  onClose: () => void;
  onClosed?: () => void;
}) {
  // Keep showing the last result while the sheet animates out.
  const last = useRef(resultProp);
  if (resultProp) last.current = resultProp;
  const result = resultProp ?? last.current;
  const lang = result ? normalizeLanguage(result.language) : null;
  const forced = result?.forced === "True";
  const hi = result?.hearing_impaired === "True";

  return (
    <BottomSheet
      visible={resultProp !== null}
      onClose={onClose}
      onClosed={onClosed}
      header={
        <SheetTitleRow
          title="Subtitle details"
          subtitle={result ? `${result.provider}${result.uploader ? ` · ${result.uploader}` : ""}` : undefined}
          onClose={onClose}
        />
      }
      footer={
        result ? (
          <Button
            label={downloading ? "Downloading…" : "Download"}
            onPress={() => onDownload(result)}
            loading={downloading}
            size="lg"
            icon={downloading ? undefined : <Icon icon={Download} size={16} color="white" />}
          />
        ) : null
      }
    >
      {result ? (
        <>
          {result.release_info.map((name, i) => (
            <Text
              key={`${name}-${i}`}
              selectable
              className={`text-sm leading-5 ${i === 0 ? "text-zinc-100" : "text-zinc-400"} mb-1`}
            >
              {name}
            </Text>
          ))}

          <View className="flex-row items-center flex-wrap gap-2.5 mt-2 mb-4 pt-1">
            <SubtitleTrackChip
              code={result.language}
              name={lang?.name}
              state="present"
              forced={forced}
              hi={hi}
            />
            <Text className="text-zinc-200 text-sm">
              {lang?.name ?? result.language}
              {forced ? ", forced" : ""}
              {hi ? ", hearing impaired" : ""}
            </Text>
            <ScoreBadge score={result.score} />
          </View>

          <DetailStatGrid>
            <DetailStat label="Provider" value={result.provider} />
            <DetailStat label="Score" value={`${Math.round(result.score)}%`} />
            {result.uploader ? <DetailStat label="Uploader" value={result.uploader} /> : null}
            {result.original_format ? (
              <DetailStat
                label="Format"
                value={result.original_format === "True" ? "Original" : "Converted to SRT"}
              />
            ) : null}
          </DetailStatGrid>

          <MatchList matched={result.matches} missed={result.dont_matches} />

          {result.url ? (
            <View className="flex-row items-center gap-1 mb-3">
              <Icon icon={ExternalLink} size={12} color="#71717a" />
              <Text className="text-zinc-500 text-xs flex-1" numberOfLines={1}>
                {result.url}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  );
}
