import { useEffect, useMemo, useState } from "react";
import { useRouter, type Href } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import {
  AudioWaveform,
  FileDown,
  Languages,
  Timer,
  Trash2,
  WandSparkles,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { PickerSheet, type PickerOption } from "@/components/ui/picker-sheet";
import { toast, toastError } from "@/components/ui/toast";
import { SubtitleTimingSheet } from "@/components/subtitles/subtitle-timing-sheet";
import { UploadSubtitleSheet } from "@/components/subtitles/upload-subtitle-sheet";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useBazarrCapabilities,
  useBazarrEnabledLanguages,
  useBazarrJobsActive,
  useBazarrLanguageProfiles,
  useBazarrSubtitleMutation,
  useTrackBazarrJobs,
} from "@/hooks/use-bazarr-subtitles";
import {
  deleteSubtitle,
  runSubtitleTool,
  searchMissingSubtitles,
  searchSubtitle,
  setLanguageProfile,
  uploadSubtitle,
  type PickedSubtitleFile,
} from "@/services/bazarr-api";
import {
  CLEANUP_MODS,
  isEmbedded,
  isModifiable,
  type LanguageChoice,
  type SubtitleTarget,
  type SubtitleToolAction,
} from "@/lib/bazarr-subtitle-tools";
import { hasSubtitleExtension } from "@/lib/subtitle-filename";
import { normalizeLanguage } from "@/lib/language-codes";
import { lightHaptic } from "@/lib/haptics";
import type { SubtitleRow } from "@/lib/subtitle-model";
import type {
  BazarrMissingSubtitle,
  BazarrSubtitle,
} from "@/lib/types";

/**
 * Everything behind the subtitle list of one movie or episode: the row "⋯"
 * sheet (sync, timing, translate, clean up, delete; translate and extract for
 * embedded tracks), the per-language and all-missing searches, manual search,
 * upload, and the language profile — plus every modal those need.
 *
 * All modals are steps of one useModalFlow, so any chain (sheet → picker,
 * sheet → confirm, sheet → OS file picker, sheet → navigation) is sequenced
 * safely on iOS. The optional `host` step is for a sheet that itself shows
 * the list (the episode subtitles sheet): opening a row's menu from it closes
 * the host first.
 *
 * Shared by the movie page's Subtitles card and the series page's episode
 * subtitles sheet.
 */

export type SubtitleFlowSteps = {
  host: void;
  menu: SubtitleRow;
  timing: SubtitleRow;
  translate: SubtitleRow;
  cleanup: SubtitleRow;
  confirmDelete: SubtitleRow;
  profile: void;
  upload: PickedSubtitleFile;
};

// PickerSheet values are numbers; "no profile" needs one too.
const NO_PROFILE = -1;

export function useSubtitleActions({
  bazarrId,
  target,
  item,
  title,
  videoFps,
  profileTarget,
  manualSearchHref,
}: {
  bazarrId: string | null;
  // The movie/episode actions apply to; null while nothing is selected.
  target: SubtitleTarget | null;
  item: {
    subtitles: BazarrSubtitle[];
    missing_subtitles: BazarrMissingSubtitle[];
    profileId: number | null;
  } | null;
  // "Dune: Part Two" / "S01E02 · Fault Lines", for sheet subtitles.
  title: string;
  videoFps?: number | null;
  // Profiles belong to the movie or the whole series.
  profileTarget: { type: "movie"; radarrId: number } | { type: "series"; seriesId: number } | null;
  // Route of the manual-search screen for `target`.
  manualSearchHref: Href | null;
}) {
  const router = useRouter();
  const flow = useModalFlow<SubtitleFlowSteps>();
  const caps = useBazarrCapabilities(bazarrId);
  const { data: profiles } = useBazarrLanguageProfiles(bazarrId);
  const { data: enabledLanguages } = useBazarrEnabledLanguages(bazarrId);
  const jobsActive = useBazarrJobsActive(bazarrId);
  const track = useTrackBazarrJobs(bazarrId);

  // Rows whose search the user started, until Bazarr's queue drains (or the
  // refreshed data no longer lists them as missing).
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!jobsActive) setBusyKeys(new Set());
  }, [jobsActive]);
  const markBusy = (keys: string[]) =>
    setBusyKeys((prev) => new Set([...prev, ...keys]));

  const targetOf = () => target;

  const searchOne = useBazarrSubtitleMutation(
    bazarrId,
    (lang: LanguageChoice, id) => searchSubtitle(target!, lang, id),
    targetOf,
  );
  const searchAll = useBazarrSubtitleMutation(
    bazarrId,
    async (_: void, id) => {
      if (!target) return;
      // An episode has no "search missing" action of its own: one search per
      // missing language, as Bazarr's own Wanted page does.
      if (target.type === "movie") {
        await searchMissingSubtitles({ type: "movie", radarrId: target.radarrId }, id);
      } else {
        await Promise.all(
          (item?.missing_subtitles ?? []).map((m) =>
            searchSubtitle(target, { code2: m.code2, forced: m.forced, hi: m.hi }, id),
          ),
        );
      }
    },
    targetOf,
  );
  const upload = useBazarrSubtitleMutation(
    bazarrId,
    (args: { file: PickedSubtitleFile; lang: LanguageChoice }, id) =>
      uploadSubtitle(target!, args.file, args.lang, id),
    targetOf,
  );
  const remove = useBazarrSubtitleMutation(
    bazarrId,
    (sub: BazarrSubtitle, id) => deleteSubtitle(target!, sub, id),
    targetOf,
  );
  const tool = useBazarrSubtitleMutation(
    bazarrId,
    (args: { sub: BazarrSubtitle; action: SubtitleToolAction }, id) =>
      runSubtitleTool(target!, args.sub, args.action, id),
    targetOf,
  );
  const profile = useBazarrSubtitleMutation(
    bazarrId,
    (profileId: number | null, id) => setLanguageProfile(profileTarget!, profileId, id),
    targetOf,
  );

  const profileName =
    item?.profileId != null
      ? (profiles?.find((p) => p.profileId === item.profileId)?.name ?? "Unknown profile")
      : null;

  // --- Handlers for SubtitlesBlock ---

  const onSearchLanguage = (row: SubtitleRow) => {
    lightHaptic();
    searchOne.mutate(
      { code2: row.code2, forced: row.forced, hi: row.hi },
      {
        onSuccess: () => {
          markBusy([row.key]);
          toast(`Searching ${row.name} subtitles…`, "info");
        },
        onError: (err) => toastError("Couldn't start the search", err),
      },
    );
  };

  const onSearchAll = () => {
    lightHaptic();
    const missing = item?.missing_subtitles ?? [];
    if (missing.length === 0) {
      toast("No subtitles are missing", "info");
      return;
    }
    searchAll.mutate(undefined, {
      onSuccess: () => {
        markBusy(missing.map((m) => `${m.code2}|${m.forced ? "f" : ""}${m.hi ? "h" : ""}|missing`));
        toast(
          missing.length === 1
            ? `Searching ${missing[0].name} subtitles…`
            : `Searching ${missing.length} missing languages…`,
          "info",
        );
      },
      onError: (err) => toastError("Couldn't start the search", err),
    });
  };

  const onManual = () => {
    if (manualSearchHref) flow.whenClear(() => router.push(manualSearchHref));
  };

  // The OS picker never opens over a sheet: it waits until the flow is clear,
  // then the upload sheet opens with the picked file.
  const pickFile = () =>
    flow.whenClear(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        // iOS has no UTType for most subtitle formats; validate afterwards.
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!hasSubtitleExtension(asset.name)) {
        toast(`${asset.name} isn't a subtitle file. Pick an .srt, .ass or .vtt file.`, "error");
        return;
      }
      flow.open("upload", { uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
    });

  const blockProps = {
    busyKeys,
    onSearchLanguage,
    onRowMenu: (row: SubtitleRow) => flow.open("menu", row),
    onSearchAll,
    onManual,
    onUpload: pickFile,
    profileName,
    onPressProfile: profileTarget ? () => flow.open("profile") : undefined,
  };

  // --- Row menu ---

  const menuRow = flow.payload("menu");
  const runTool = (row: SubtitleRow, action: SubtitleToolAction, started: string) => {
    if (!row.sub) return;
    tool.mutate(
      { sub: row.sub, action },
      {
        onSuccess: () => toast(started, "info"),
        onError: (err) => toastError("Bazarr couldn't run that", err),
      },
    );
  };

  const menuActions: ActionSheetAction[] = (() => {
    const row = menuRow;
    if (!row?.sub) return [];
    const icon = (c: React.ComponentType<any>) => <Icon icon={c} size={20} color="#a1a1aa" />;
    if (isEmbedded(row.sub)) {
      const actions: ActionSheetAction[] = [];
      actions.push({
        label: "Translate…",
        subtitle: caps.translateEmbedded
          ? "Extracts the track, then translates it"
          : "Needs Bazarr 1.6.2 or later",
        icon: icon(Languages),
        disabled: !caps.translateEmbedded || row.sub.id == null,
        onPress: () => flow.open("translate", row),
      });
      actions.push({
        label: "Extract to file",
        subtitle: caps.extract ? "Saves this track next to the video" : "Needs Bazarr 1.6.1 or later",
        icon: icon(FileDown),
        disabled: !caps.extract || row.sub.id == null,
        onPress: () => runTool(row, { kind: "extract" }, `Extracting the ${row.name} track…`),
      });
      return actions;
    }
    const srt = isModifiable(row.sub);
    return [
      {
        label: "Sync to audio",
        subtitle: "Re-times lines against the audio track",
        icon: icon(AudioWaveform),
        onPress: () => runTool(row, { kind: "sync" }, `Syncing ${row.name} to the audio…`),
      },
      {
        label: "Adjust timing…",
        subtitle: srt ? "Shift by any amount or fix the frame rate" : "Only for .srt files",
        icon: icon(Timer),
        disabled: !srt,
        onPress: () => flow.open("timing", row),
      },
      {
        label: "Translate…",
        subtitle: "Machine translation with Bazarr's translator",
        icon: icon(Languages),
        onPress: () => flow.open("translate", row),
      },
      {
        label: "Clean up…",
        subtitle: srt ? "Hearing-impaired tags, OCR and common fixes" : "Only for .srt files",
        icon: icon(WandSparkles),
        disabled: !srt,
        onPress: () => flow.open("cleanup", row),
      },
      {
        label: "Delete subtitle",
        icon: <Icon icon={Trash2} size={20} color="#ef4444" />,
        variant: "danger",
        onPress: () => flow.open("confirmDelete", row),
      },
    ];
  })();

  // --- Pickers ---

  const translateRow = flow.payload("translate");
  const translateOptions = useMemo<PickerOption<string>[]>(() => {
    const source = translateRow?.code2;
    const missing = (item?.missing_subtitles ?? []).filter((m) => m.code2 !== source);
    const seen = new Set(missing.map((m) => m.code2));
    return [
      ...missing.map((m) => ({ value: m.code2, label: m.name, description: "Missing in the profile" })),
      ...(enabledLanguages ?? [])
        .filter((l) => l.code2 !== source && !seen.has(l.code2))
        .map((l) => ({ value: l.code2, label: l.name })),
    ];
  }, [translateRow, item, enabledLanguages]);

  const uploadLanguages = useMemo(() => {
    const profileCodes =
      profiles
        ?.find((p) => p.profileId === item?.profileId)
        ?.items.map((i) => i.language) ?? [];
    const codes = [...new Set([...profileCodes, ...(enabledLanguages ?? []).map((l) => l.code2)])];
    return codes.map((code2) => ({
      code2,
      name:
        enabledLanguages?.find((l) => l.code2 === code2)?.name ??
        normalizeLanguage(code2)?.name ??
        code2,
    }));
  }, [profiles, item?.profileId, enabledLanguages]);

  const profileOptions: PickerOption[] = [
    ...(profiles ?? []).map((p) => ({
      value: p.profileId,
      label: p.name,
      description: p.items.map((i) => i.language.toUpperCase()).join(" + "),
    })),
    { value: NO_PROFILE, label: "None", description: "Bazarr stops looking for subtitles" },
  ];

  const timingRow = flow.payload("timing");
  const cleanupRow = flow.payload("cleanup");
  const deleteRow = flow.payload("confirmDelete");
  const uploadFile = flow.payload("upload");

  const modals = (
    <>
      <ActionSheet
        {...flow.bind("menu")}
        title={
          menuRow
            ? `${menuRow.name}${menuRow.forced ? " (forced)" : ""}${menuRow.hi ? " (hearing impaired)" : ""}`
            : ""
        }
        subtitle={menuRow?.sub?.path?.split("/").pop() ?? (menuRow ? "Embedded track" : undefined)}
        actions={menuActions}
      />

      <SubtitleTimingSheet
        {...flow.bind("timing")}
        subtitle={timingRow ? `${timingRow.name} · ${timingRow.sub?.path?.split("/").pop() ?? ""}` : ""}
        videoFps={videoFps}
        busy={tool.isPending}
        onApply={(mod, description) => {
          if (!timingRow?.sub) return;
          tool.mutate(
            { sub: timingRow.sub, action: { kind: "mod", mod } },
            {
              onSuccess: () => {
                flow.close();
                toast(`${description}: ${timingRow.name}`);
              },
              onError: (err) => toastError("Bazarr couldn't change the timing", err),
            },
          );
        }}
      />

      <PickerSheet<string>
        {...flow.bind("translate")}
        title={translateRow ? `Translate ${translateRow.name}` : "Translate"}
        options={translateOptions}
        selected={[]}
        emptyTitle="No other languages"
        emptyMessage="Enable more languages in Bazarr's settings to translate into them."
        onPick={(code2) => {
          const row = translateRow;
          flow.close();
          if (!row) return;
          const name = translateOptions.find((o) => o.value === code2)?.label ?? code2;
          runTool(row, { kind: "translate", to: code2 }, `Translating ${row.name} to ${name}…`);
        }}
      />

      <PickerSheet<string>
        {...flow.bind("cleanup")}
        title={cleanupRow ? `Clean up ${cleanupRow.name}` : "Clean up"}
        options={CLEANUP_MODS.map((m) => ({ value: m.mod, label: m.label, description: m.description }))}
        selected={[]}
        searchable={false}
        onPick={(mod) => {
          const row = cleanupRow;
          flow.close();
          if (!row) return;
          const label = CLEANUP_MODS.find((m) => m.mod === mod)?.label ?? mod;
          runTool(row, { kind: "mod", mod }, `${label}: ${row.name}`);
        }}
      />

      <PickerSheet
        {...flow.bind("profile")}
        title="Language profile"
        options={profileOptions}
        selected={[item?.profileId ?? NO_PROFILE]}
        searchable={false}
        loading={!profiles}
        onPick={(value) => {
          flow.close();
          const next = value === NO_PROFILE ? null : value;
          if (next === (item?.profileId ?? null)) return;
          profile.mutate(next, {
            onSuccess: () =>
              toast(
                `Language profile set to ${profileOptions.find((o) => o.value === value)?.label ?? "None"}`,
              ),
            onError: (err) => toastError("Couldn't change the language profile", err),
          });
        }}
      />

      <ConfirmModal
        {...flow.bind("confirmDelete")}
        title="Delete subtitle"
        message={
          deleteRow
            ? `Delete the ${deleteRow.name}${deleteRow.forced ? " forced" : ""} subtitle file? If the language profile asks for it, Bazarr searches for it again.`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          const row = deleteRow;
          flow.close();
          if (!row?.sub) return;
          remove.mutate(row.sub, {
            onSuccess: () => toast(`Deleted ${row.name} subtitle`),
            onError: (err) => toastError("Couldn't delete the subtitle", err),
          });
        }}
      />

      <UploadSubtitleSheet
        {...flow.bind("upload")}
        title={title}
        fileName={uploadFile?.name ?? null}
        languages={uploadLanguages}
        busy={upload.isPending}
        onChangeFile={() => {
          flow.close();
          pickFile();
        }}
        onUpload={(lang) => {
          if (!uploadFile) return;
          upload.mutate(
            { file: uploadFile, lang },
            {
              onSuccess: () => {
                flow.close();
                toast(
                  `Uploaded ${uploadLanguages.find((l) => l.code2 === lang.code2)?.name ?? lang.code2} subtitle`,
                );
              },
              onError: (err) => toastError("Couldn't upload the subtitle", err),
            },
          );
        }}
      />
    </>
  );

  return { flow, blockProps, modals, profileName, track };
}
