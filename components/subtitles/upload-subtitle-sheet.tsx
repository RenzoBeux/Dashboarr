import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { FileText } from "lucide-react-native";
import { BottomSheet, SheetTitleRow } from "@/components/ui/bottom-sheet";
import { FilterChip } from "@/components/ui/filter-chip";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { parseSubtitleFilename } from "@/lib/subtitle-filename";
import { normalizeLanguage } from "@/lib/language-codes";
import type { LanguageChoice } from "@/lib/bazarr-subtitle-tools";

export interface UploadLanguageOption {
  code2: string;
  name: string;
}

/**
 * Confirm an upload: the picked file (with a way to pick another), its
 * language and whether it is forced or hearing-impaired. Language and flags
 * are prefilled from the file name ("Film.de.forced.srt"). The file itself is
 * picked before this sheet opens — the OS picker never stacks on a sheet.
 */
export function UploadSubtitleSheet({
  visible,
  title,
  fileName,
  languages,
  busy = false,
  onChangeFile,
  onUpload,
  onClose,
  onClosed,
}: {
  visible: boolean;
  // The movie or episode, for the subtitle line.
  title: string;
  fileName: string | null;
  // Offered languages, profile languages first.
  languages: readonly UploadLanguageOption[];
  busy?: boolean;
  onChangeFile: () => void;
  onUpload: (lang: LanguageChoice) => void;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const [code2, setCode2] = useState<string | null>(null);
  const [forced, setForced] = useState(false);
  const [hi, setHi] = useState(false);

  // Prefill from each newly picked file.
  useEffect(() => {
    if (!fileName) return;
    const parsed = parseSubtitleFilename(fileName);
    setCode2(parsed.code2 ?? languages[0]?.code2 ?? null);
    setForced(parsed.forced);
    setHi(parsed.hi && !parsed.forced);
    // Re-run only for a new file; the language list may refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  // A file named for a language outside the list still gets its chip.
  const options =
    code2 && !languages.some((l) => l.code2 === code2)
      ? [...languages, { code2, name: normalizeLanguage(code2)?.name ?? code2 }]
      : languages;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
      header={<SheetTitleRow title="Upload subtitle" subtitle={title} onClose={onClose} />}
      footer={
        <Button
          label={busy ? "Uploading…" : "Upload"}
          onPress={() => code2 && onUpload({ code2, forced, hi })}
          disabled={!code2 || !fileName || busy}
          loading={busy}
          size="lg"
        />
      }
    >
      <Pressable
        onPress={onChangeFile}
        className="flex-row items-center gap-3 rounded-2xl border-[0.1rem] border-dashed border-zinc-600 px-4 py-3 mb-4 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={fileName ? `Change file, ${fileName}` : "Choose a file"}
      >
        <Icon icon={FileText} size={18} color="#a1a1aa" />
        <Text
          className={`flex-1 text-sm ${fileName ? "text-zinc-100" : "text-zinc-400"}`}
          numberOfLines={1}
        >
          {fileName ?? "Choose a .srt, .ass or .vtt file"}
        </Text>
        {fileName ? <Text className="text-primary text-xs font-semibold">Change</Text> : null}
      </Pressable>

      <Text className="text-zinc-400 text-xs mb-2 ml-0.5">Language</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {options.map((l) => (
          <FilterChip
            key={l.code2}
            label={l.name}
            selected={code2 === l.code2}
            onPress={() => setCode2(l.code2)}
          />
        ))}
      </ScrollView>

      {/* Bazarr stores one flag per subtitle: forced and HI exclude each other. */}
      <Toggle
        label="Forced"
        description="Only the foreign-language parts"
        value={forced}
        onValueChange={(v) => {
          setForced(v);
          if (v) setHi(false);
        }}
      />
      <View className="h-3" />
      <Toggle
        label="Hearing impaired"
        description="Includes sound descriptions"
        value={hi}
        onValueChange={(v) => {
          setHi(v);
          if (v) setForced(false);
        }}
      />
    </BottomSheet>
  );
}
