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
import { BinderySearchSection } from "@/components/search/bindery-search-section";
import { OverseerrSearchSection } from "@/components/search/overseerr-search-section";
import { ReleaseSearchSection } from "@/components/search/release-search-section";
import { prowlarrIndexerAdapter } from "@/lib/indexer-adapters/prowlarr";
import { jackettIndexerAdapter } from "@/lib/indexer-adapters/jackett";
import { nzbhydra2IndexerAdapter } from "@/lib/indexer-adapters/nzbhydra2";

const MIN_QUERY = 2;

/**
 * Global search (#223): one input that fans out across the services attached to
 * the active dashboard, grouped into per-category collapsible sections. Reuses
 * the existing per-service search hooks/components unchanged; sections render
 * independently so a slow indexer search never blocks the fast lookups.
 */
export default function GlobalSearchScreen() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, 300);
  const attachedKinds = useAttachedKinds();

  const hasRadarr = attachedKinds.has("radarr");
  const hasSonarr = attachedKinds.has("sonarr");
  const hasLidarr = attachedKinds.has("lidarr");
  const hasBindery = attachedKinds.has("bindery");
  const hasOverseerr = attachedKinds.has("overseerr");
  const hasProwlarr = attachedKinds.has("prowlarr");
  const hasJackett = attachedKinds.has("jackett");
  const hasNzbhydra2 = attachedKinds.has("nzbhydra2");
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
          message="Attach Radarr, Sonarr, Lidarr, Bindery, Seerr, Prowlarr, Jackett, or NZBHydra2 to this dashboard to search them here."
        />
      ) : !active ? (
        <EmptyState
          icon={<Icon icon={Search} size={32} color="#71717a" />}
          title="Search across your services"
          message="Type at least 2 characters to search Movies, TV, Music, Books, Requests, and Releases."
        />
      ) : (
        <>
          {/* The *arr sections take the raw query: their library half matches on
              the keystroke and they debounce their own lookup (#304). */}
          {hasRadarr && <RadarrSearchSection query={trimmed} />}
          {hasSonarr && <SonarrSearchSection query={trimmed} />}
          {hasLidarr && <LidarrSearchSection query={trimmed} />}
          {hasBindery && <BinderySearchSection query={trimmed} />}
          {hasOverseerr && <OverseerrSearchSection query={debounced} />}
          {hasProwlarr && (
            <ReleaseSearchSection adapter={prowlarrIndexerAdapter} query={debounced} />
          )}
          {hasJackett && (
            <ReleaseSearchSection adapter={jackettIndexerAdapter} query={debounced} />
          )}
          {hasNzbhydra2 && (
            <ReleaseSearchSection adapter={nzbhydra2IndexerAdapter} query={debounced} />
          )}
        </>
      )}
    </ScreenWrapper>
  );
}
