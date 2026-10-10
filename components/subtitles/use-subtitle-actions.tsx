import { useEffect, useMemo, useRef, useState } from "react";
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
  searchSubtitles,
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
  upload: void;
};

// PickerSheet values are numbers; "no profile" needs one too.
const NO_PROFILE = -1;

export function useSubtitleActions({
  bazarrId,
  target,
  item,
  profileId: profileIdProp,
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
    profileId?: number | null;
  } | null;
  // The language profile in effect, when it isn't the item's own (a series'
  // profile applies to every episode, selected or not).
  profileId?: number | null;
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

  const profileId = profileIdProp !== undefined ? profileIdProp : (item?.profileId ?? null);

  // Rows whose search the user started, until Bazarr's queue drains (or the
  // refreshed data no longer lists them as missing). Keyed per movie/episode,
  // since one instance serves every episode of a series.
  const targetKey = !target
    ? ""
    : target.type === "movie"
      ? `m${target.radarrId}`
      : `e${target.episodeId}`;
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  // Rows whose search request hasn't answered yet: they stay busy when an
  // earlier action's job watch ends.
  const inFlight = useRef(new Map<string, number>());
  useEffect(() => {
    if (!jobsActive) setBusy(new Set(inFlight.current.keys()));
  }, [jobsActive]);
  // Starts a search for `keys` (row keys of the current target): busy from
  // the tap, since before 1.5.6 the request itself takes the whole search.
  const searchRows = (
    keys: string[],
    request: Promise<unknown>,
    onSuccess: () => void,
  ) => {
    const full = keys.map((k) => `${targetKey}:${k}`);
    for (const k of full) inFlight.current.set(k, (inFlight.current.get(k) ?? 0) + 1);
    setBusy((prev) => new Set([...prev, ...full]));
    const settle = () => {
      for (const k of full) {
        const n = (inFlight.current.get(k) ?? 1) - 1;
        if (n > 0) inFlight.current.set(k, n);
        else inFlight.current.delete(k);
      }
    };
    request.then(
      () => {
        settle();
        onSuccess();
      },
      (err) => {
        settle();
        setBusy((prev) => {
          const next = new Set(prev);
          for (const k of full) if (!inFlight.current.has(k)) next.delete(k);
          return next;
        });
        toastError("Couldn't start the search", err);
      },
    );
  };
  const busyKeys = useMemo(
    () =>
      new Set(
        [...busy]
          .filter((k) => k.startsWith(`${targetKey}:`))
          .map((k) => k.slice(targetKey.length + 1)),
      ),
    [busy, targetKey],
  );

  // When an action starts from the host sheet (the episode subtitles sheet),
  // the host comes back once the action — or its cancel — is done.
  const returnToHost = useRef(false);
  const closeStep = () => {
    flow.close();
    if (returnToHost.current) flow.open("host");
  };
  const stepBind = (step: Exclude<keyof SubtitleFlowSteps, "host">) => ({
    ...flow.bind(step),
    onClose: closeStep,
    onCancel: closeStep,
  });
  const fromHost = () => {
    returnToHost.current = flow.isOpen("host");
  };

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
        await searchSubtitles(
          (item?.missing_subtitles ?? []).map((m) => ({
            target,
            lang: { code2: m.code2, forced: m.forced, hi: m.hi },
          })),
          id,
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
  // The file picked in the upload sheet.
  const [uploadFile, setUploadFile] = useState<PickedSubtitleFile | null>(null);
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
    (next: number | null, id) => setLanguageProfile(profileTarget!, next, id),
    // Refresh what the profile belongs to, whether or not an episode is
    // selected (any episode target refreshes the whole series' keys).
    () =>
      profileTarget?.type === "movie"
        ? { type: "movie", radarrId: profileTarget.radarrId }
        : profileTarget
          ? { type: "episode", seriesId: profileTarget.seriesId, episodeId: 0 }
          : null,
  );

  const profileName =
    profileId != null
      ? (profiles?.find((p) => p.profileId === profileId)?.name ?? "Unknown profile")
      : null;

  // --- Handlers for SubtitlesBlock ---

  const onSearchLanguage = (row: SubtitleRow) => {
    lightHaptic();
    searchRows(
      [row.key],
      searchOne.mutateAsync({ code2: row.code2, forced: row.forced, hi: row.hi }),
      () => toast(`Searching ${row.name} subtitles…`, "info"),
    );
  };

  const onSearchAll = () => {
    lightHaptic();
    const missing = item?.missing_subtitles ?? [];
    if (missing.length === 0) {
      toast("No subtitles are missing", "info");
      return;
    }
    const keys = missing.map((m) => `${m.code2}|${m.forced ? "f" : ""}${m.hi ? "h" : ""}|missing`);
    if (keys.every((k) => busyKeys.has(k))) {
      toast("Already searching", "info");
      return;
    }
    searchRows(keys, searchAll.mutateAsync(), () =>
      toast(
        missing.length === 1
          ? `Searching ${missing[0].name} subtitles…`
          : `Searching ${missing.length} missing languages…`,
        "info",
      ),
    );
  };

  // whenClear closes the host sheet first when Manual is tapped inside it.
  const onManual = () => {
    if (manualSearchHref) flow.whenClear(() => router.push(manualSearchHref));
  };

  // Upload opens its sheet first and the OS picker opens from inside it, over
  // a fully presented sheet. Picking only updates the sheet's state, so no new
  // modal has to appear while the OS picker is still animating away.
  const openUpload = () => {
    fromHost();
    setUploadFile(null);
    flow.open("upload");
  };
  const pickFile = async () => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        // iOS has no UTType for most subtitle formats; validate afterwards.
        type: "*/*",
        copyToCacheDirectory: true,
      });
    } catch (err) {
      // E.g. a second picker requested while one is still open.
      toastError("Couldn't open the file picker", err);
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!hasSubtitleExtension(asset.name)) {
      toast(`${asset.name} isn't a subtitle file. Pick an .srt, .ass or .vtt file.`, "error");
      return;
    }
    setUploadFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  };

  const blockProps = {
    busyKeys,
    onSearchLanguage,
    onRowMenu: (row: SubtitleRow) => {
      fromHost();
      flow.open("menu", row);
    },
    onSearchAll,
    onManual,
    onUpload: openUpload,
    profileName,
    onPressProfile: profileTarget
      ? () => {
          fromHost();
          flow.open("profile");
        }
      : undefined,
  };

  // --- Row menu ---

  const menuRow = flow.payload("menu");
  const runTool = (row: SubtitleRow, action: SubtitleToolAction, started: string) => {
    if (!row.sub) return;
    tool.mutateAsync({ sub: row.sub, action }).then(
      () => toast(started, "info"),
      (err) => toastError("Bazarr couldn't run that", err),
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
        ?.find((p) => p.profileId === profileId)
        ?.items.map((i) => i.language) ?? [];
    const codes = [...new Set([...profileCodes, ...(enabledLanguages ?? []).map((l) => l.code2)])];
    return codes.map((code2) => ({
      code2,
      name:
        enabledLanguages?.find((l) => l.code2 === code2)?.name ??
        normalizeLanguage(code2)?.name ??
        code2,
    }));
  }, [profiles, profileId, enabledLanguages]);

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

  const modals = (
    <>
      <ActionSheet
        {...stepBind("menu")}
        title={
          menuRow
            ? `${menuRow.name}${menuRow.forced ? " (forced)" : ""}${menuRow.hi ? " (hearing impaired)" : ""}`
            : ""
        }
        subtitle={menuRow?.sub?.path?.split("/").pop() ?? (menuRow ? "Embedded track" : undefined)}
        actions={menuActions}
      />

      <SubtitleTimingSheet
        {...stepBind("timing")}
        subtitle={timingRow ? `${timingRow.name} · ${timingRow.sub?.path?.split("/").pop() ?? ""}` : ""}
        videoFps={videoFps}
        // The tool mutation is shared by every row; busy only for this one's.
        busy={tool.isPending && tool.variables?.sub === timingRow?.sub}
        onApply={(mod, description) => {
          if (!timingRow?.sub) return;
          tool.mutateAsync({ sub: timingRow.sub, action: { kind: "mod", mod } }).then(
            () => {
              // The user may have closed the sheet while it ran.
              if (flow.isOpen("timing")) closeStep();
              toast(`${description}: ${timingRow.name}`);
            },
            (err) => toastError("Bazarr couldn't change the timing", err),
          );
        }}
      />

      <PickerSheet<string>
        {...stepBind("translate")}
        title={translateRow ? `Translate ${translateRow.name}` : "Translate"}
        options={translateOptions}
        selected={[]}
        emptyTitle="No other languages"
        emptyMessage="Enable more languages in Bazarr's settings to translate into them."
        onPick={(code2) => {
          const row = translateRow;
          closeStep();
          if (!row) return;
          const name = translateOptions.find((o) => o.value === code2)?.label ?? code2;
          runTool(row, { kind: "translate", to: code2 }, `Translating ${row.name} to ${name}…`);
        }}
      />

      <PickerSheet<string>
        {...stepBind("cleanup")}
        title={cleanupRow ? `Clean up ${cleanupRow.name}` : "Clean up"}
        options={CLEANUP_MODS.map((m) => ({ value: m.mod, label: m.label, description: m.description }))}
        selected={[]}
        searchable={false}
        onPick={(mod) => {
          const row = cleanupRow;
          closeStep();
          if (!row) return;
          const label = CLEANUP_MODS.find((m) => m.mod === mod)?.label ?? mod;
          runTool(row, { kind: "mod", mod }, `${label}: ${row.name}`);
        }}
      />

      <PickerSheet
        {...stepBind("profile")}
        title="Language profile"
        options={profileOptions}
        selected={[profileId ?? NO_PROFILE]}
        searchable={false}
        loading={!profiles}
        onPick={(value) => {
          closeStep();
          const next = value === NO_PROFILE ? null : value;
          if (next === profileId) return;
          profile.mutateAsync(next).then(
            () =>
              toast(
                `Language profile set to ${profileOptions.find((o) => o.value === value)?.label ?? "None"}`,
              ),
            (err) => toastError("Couldn't change the language profile", err),
          );
        }}
      />

      <ConfirmModal
        {...stepBind("confirmDelete")}
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
          closeStep();
          if (!row?.sub) return;
          remove.mutateAsync(row.sub).then(
            () => toast(`Deleted ${row.name} subtitle`),
            (err) => toastError("Couldn't delete the subtitle", err),
          );
        }}
      />

      <UploadSubtitleSheet
        {...stepBind("upload")}
        title={title}
        fileName={uploadFile?.name ?? null}
        languages={uploadLanguages}
        busy={upload.isPending && upload.variables?.file === uploadFile}
        onChangeFile={() => void pickFile()}
        onUpload={(lang) => {
          if (!uploadFile) return;
          upload.mutateAsync({ file: uploadFile, lang }).then(
            () => {
              if (flow.isOpen("upload")) closeStep();
              toast(
                `Uploaded ${uploadLanguages.find((l) => l.code2 === lang.code2)?.name ?? lang.code2} subtitle`,
              );
            },
            (err) => toastError("Couldn't upload the subtitle", err),
          );
        }}
      />
    </>
  );

  return { flow, blockProps, modals, profileName, track };
}
