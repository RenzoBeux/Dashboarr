import { useState } from "react";
import { Search } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { hasSearchableKind } from "@/lib/global-search";
import { RadarrSearchSection } from "@/components/search/radarr-search-section";
import { SonarrSearchSection } from "@/components/search/sonarr-search-section";
import { LidarrSearchSection } from "@/components/search/lidarr-search-section";
import { OverseerrSearchSection } from "@/components/search/overseerr-search-section";
import { ReleaseSearchSection } from "@/components/search/release-search-section";
import { prowlarrIndexerAdapter } from "@/lib/indexer-adapters/prowlarr";
import { jackettIndexerAdapter } from "@/lib/indexer-adapters/jackett";

const MIN_QUERY = 2;

/**
 * Global search (#223): one input that fans out across the services attached to
 * the active dashboard, grouped into per-category collapsible sections. Reuses
 * the existing per-service search hooks/components unchanged; sections render
 * independently so a slow indexer search never blocks the fast lookups.
 */
export default function GlobalSearchScreen() {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const attachedKinds = useAttachedKinds();

  const hasRadarr = attachedKinds.has("radarr");
  const hasSonarr = attachedKinds.has("sonarr");
  const hasLidarr = attachedKinds.has("lidarr");
  const hasOverseerr = attachedKinds.has("overseerr");
  const hasProwlarr = attachedKinds.has("prowlarr");
  const hasJackett = attachedKinds.has("jackett");
  const anySearchable = hasSearchableKind(attachedKinds);

  const active = debounced.length >= MIN_QUERY;

  return (
    <ScreenWrapper>
      <BackHeader title="Search" />

      <TextInput
        placeholder="Search across your services..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {!anySearchable ? (
        <EmptyState
          icon={<Icon icon={Search} size={32} color="#71717a" />}
          title="No searchable services"
          message="Attach Radarr, Sonarr, Lidarr, Seerr, Prowlarr, or Jackett to this dashboard to search them here."
        />
      ) : !active ? (
        <EmptyState
          icon={<Icon icon={Search} size={32} color="#71717a" />}
          title="Search across your services"
          message="Type at least 2 characters to search Movies, TV, Music, Requests, and Releases."
        />
      ) : (
        <>
          {hasRadarr && <RadarrSearchSection query={debounced} />}
          {hasSonarr && <SonarrSearchSection query={debounced} />}
          {hasLidarr && <LidarrSearchSection query={debounced} />}
          {hasOverseerr && <OverseerrSearchSection query={debounced} />}
          {hasProwlarr && (
            <ReleaseSearchSection adapter={prowlarrIndexerAdapter} query={debounced} />
          )}
          {hasJackett && (
            <ReleaseSearchSection adapter={jackettIndexerAdapter} query={debounced} />
          )}
        </>
      )}
    </ScreenWrapper>
  );
}
