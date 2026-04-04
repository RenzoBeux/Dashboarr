import { View, Text, ScrollView } from "react-native";
import { PosterCard } from "@/components/overseerr/poster-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OverseerrMediaResult } from "@/lib/types";

interface MediaRowProps {
  title: string;
  items: OverseerrMediaResult[] | undefined;
  isLoading?: boolean;
  onItemPress: (item: OverseerrMediaResult) => void;
}

export function MediaRow({
  title,
  items,
  isLoading,
  onItemPress,
}: MediaRowProps) {
  return (
    <View className="mb-6">
      <Text className="text-zinc-100 text-base font-semibold mb-3 px-1">
        {title}
      </Text>

      {isLoading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={{ width: 110 }}>
                <Skeleton width={110} height={165} borderRadius={12} />
                <View className="mt-2">
                  <Skeleton width={90} height={12} borderRadius={4} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : items && items.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {items.map((item) => (
            <PosterCard
              key={`${item.mediaType}-${item.id}`}
              item={item}
              onPress={onItemPress}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
