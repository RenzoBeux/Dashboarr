import { useEffect, useState } from "react";
import { Modal, View, Text, ScrollView } from "react-native";
import { Image } from "expo-image";
import { BookOpen } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { useServiceImage } from "@/hooks/use-service-image";
import { useAddBinderyBook } from "@/hooks/use-bindery";
import {
  isBinderyConflict,
  binderyRatingLabel,
  binderyReleaseYear,
  binderySearchImageSource,
} from "@/lib/bindery-normalize";
import type { BinderyBookSearchResult, BinderyMediaType } from "@/lib/types";

// The same choices as Bindery's Add Book dialog. "Default" omits mediaType so
// the server keeps the provider's format.
type FormatChoice = "default" | BinderyMediaType;

const FORMAT_OPTIONS: { value: FormatChoice; label: string; description: string }[] = [
  { value: "default", label: "Default", description: "The book's own format" },
  { value: "ebook", label: "Ebook", description: "Collect the ebook" },
  { value: "audiobook", label: "Audiobook", description: "Collect the audiobook" },
  { value: "both", label: "Both", description: "Collect ebook and audiobook" },
];

function capitalize(value: string | undefined): string | undefined {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : undefined;
}

interface AddBookSheetProps {
  result: BinderyBookSearchResult | null;
  visible: boolean;
  onClose: () => void;
}

export function AddBookSheet({ result, visible, onClose }: AddBookSheetProps) {
  const addBook = useAddBinderyBook();
  const footerPadding = useSheetBottomPadding();
  const [format, setFormat] = useState<FormatChoice>("default");
  const [searchOnAdd, setSearchOnAdd] = useState(true);
  const { src: coverUrl, onError: onCoverError } = useServiceImage(
    binderySearchImageSource(result?.imageUrl),
    "bindery",
  );

  useEffect(() => {
    if (visible) {
      setFormat("default");
      setSearchOnAdd(true);
    }
  }, [visible]);

  if (!result) return null;

  const details = [
    { label: "Published", value: binderyReleaseYear(result.releaseDate) },
    { label: "Rating", value: binderyRatingLabel(result.averageRating, result.ratingsCount) },
    { label: "Source", value: capitalize(result.metadataProvider) },
    { label: "Source ID", value: result.foreignBookId },
    { label: "Narrator", value: result.narrator },
  ].filter((d): d is { label: string; value: string } => !!d.value);

  const handleAdd = () => {
    addBook.mutate(
      {
        title: result.title,
        payload: {
          foreignBookId: result.foreignBookId,
          foreignAuthorId: result.author?.foreignAuthorId ?? "",
          authorName: result.author?.authorName ?? "",
          searchOnAdd,
          ...(format !== "default" ? { mediaType: format } : {}),
        },
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (isBinderyConflict(err)) onClose();
        },
      },
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Add Book" onClose={onClose} />

        <ScrollView contentContainerClassName="px-4 py-4 pb-8">
          <View className="flex-row gap-3 mb-5">
            {coverUrl ? (
              <Image
                source={{ uri: coverUrl }}
                className="rounded-lg bg-surface-light w-[5.7rem] h-[8.6rem]"
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                recyclingKey={coverUrl}
                onError={onCoverError}
              />
            ) : (
              <View className="rounded-lg bg-surface-light items-center justify-center w-[5.7rem] h-[8.6rem]">
                <Icon icon={BookOpen} size={24} color="#71717a" />
              </View>
            )}
            <View className="flex-1 justify-center">
              <Text className="text-zinc-100 text-base font-semibold" numberOfLines={3}>
                {result.title}
              </Text>
              {result.author?.authorName ? (
                <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={2}>
                  {result.author.authorName}
                </Text>
              ) : null}
              <View className="mt-2 gap-1">
                {details.map((d) => (
                  <View key={d.label} className="flex-row gap-2">
                    <Text className="text-zinc-500 text-xs w-[4.6rem]">{d.label}</Text>
                    <Text className="text-zinc-300 text-xs flex-1" numberOfLines={1}>
                      {d.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {result.isbns?.length ? (
            <View className="mb-5">
              <Text className="text-zinc-500 text-xs mb-1">ISBNs</Text>
              <Text className="text-zinc-300 text-xs" numberOfLines={2}>
                {result.isbns.slice(0, 6).join("   ")}
              </Text>
            </View>
          ) : null}

          {result.description ? (
            <Text className="text-zinc-400 text-sm mb-5" numberOfLines={6}>
              {result.description}
            </Text>
          ) : null}

          <Select
            label="Format"
            value={format}
            options={FORMAT_OPTIONS}
            onChange={setFormat}
            containerClassName="mb-4"
          />

          <Toggle
            label="Search indexers after adding"
            description="Try to grab the book automatically once it's added"
            value={searchOnAdd}
            onValueChange={setSearchOnAdd}
          />
        </ScrollView>

        <View className="px-4 pt-3 border-t border-border" style={footerPadding}>
          <Button
            label="Add Book"
            onPress={handleAdd}
            loading={addBook.isPending}
            disabled={addBook.isPending}
          />
        </View>
      </View>
    </Modal>
  );
}
