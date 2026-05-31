import { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Skeleton } from "@/components/ui/skeleton";

export interface DiscoverSliderItem {
  id: number;
  name: string;
  imageUrl: string | null;
}

interface DiscoverCollectionSliderProps {
  title: string;
  // "logo" → duotone network/studio logo on a dark card (networks, studios).
  // "genre" → backdrop image with the genre name overlaid.
  variant: "logo" | "genre";
  items: DiscoverSliderItem[];
  isLoading?: boolean;
  onItemPress: (item: DiscoverSliderItem) => void;
}

// Rem widths so tiles grow with uiScale; logos are landscape, genre tiles a
// touch wider to fit the name overlay.
const TILE_CLASS = {
  logo: "w-[8rem] h-[4.5rem]",
  genre: "w-[10rem] h-[5.5rem]",
} as const;

export function DiscoverCollectionSlider({
  title,
  variant,
  items,
  isLoading,
  onItemPress,
}: DiscoverCollectionSliderProps) {
  if (!isLoading && items.length === 0) return null;

  return (
    <View className="mb-6">
      <Text className="text-zinc-100 text-base font-semibold mb-3 px-1">
        {title}
      </Text>

      {isLoading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                width={variant === "genre" ? 140 : 112}
                height={variant === "genre" ? 77 : 63}
                borderRadius={12}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {items.map((item) => (
            <CollectionTile
              key={item.id}
              variant={variant}
              item={item}
              onPress={onItemPress}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function CollectionTile({
  variant,
  item,
  onPress,
}: {
  variant: "logo" | "genre";
  item: DiscoverSliderItem;
  onPress: (item: DiscoverSliderItem) => void;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = !!item.imageUrl && !errored;

  if (variant === "genre") {
    return (
      <Pressable
        onPress={() => onPress(item)}
        className={`active:opacity-80 rounded-xl overflow-hidden bg-surface-light justify-end ${TILE_CLASS.genre}`}
      >
        {showImage && (
          <Image
            source={{ uri: item.imageUrl! }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={item.imageUrl}
            onError={() => setErrored(true)}
          />
        )}
        <View className="absolute inset-0 bg-black/40" />
        <Text
          className="text-white text-sm font-semibold px-2.5 py-2"
          numberOfLines={2}
        >
          {item.name}
        </Text>
      </Pressable>
    );
  }

  // logo variant
  return (
    <Pressable
      onPress={() => onPress(item)}
      className={`active:opacity-80 rounded-xl bg-surface-light items-center justify-center px-3 py-2 ${TILE_CLASS.logo}`}
    >
      {showImage ? (
        <Image
          source={{ uri: item.imageUrl! }}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={item.imageUrl}
          onError={() => setErrored(true)}
        />
      ) : (
        <Text
          className="text-zinc-300 text-sm font-semibold text-center"
          numberOfLines={2}
        >
          {item.name}
        </Text>
      )}
    </Pressable>
  );
}
