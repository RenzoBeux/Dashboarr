import type { ComponentType } from "react";
import { MediaSearchResultCard } from "@/components/search/media-search-result-card";
import type { LibraryRowDisplay } from "@/hooks/use-arr-search-rows";
import type { ServiceId } from "@/lib/constants";

/**
 * A library hit promoted above the lookup results (#304). Service-agnostic: the
 * display fields are built by the adapter in use-arr-search-rows.ts, so Radarr,
 * Sonarr and Lidarr share this one row. Nothing to add here, so the card renders
 * its "In library" state and the whole row opens the existing detail screen.
 */
export function ArrLibraryRow({
  serviceId,
  fallbackIcon,
  display,
  onOpen,
}: {
  serviceId: ServiceId;
  fallbackIcon: ComponentType<{ size?: number; color?: string }>;
  display: LibraryRowDisplay;
  onOpen: () => void;
}) {
  return (
    <MediaSearchResultCard
      serviceId={serviceId}
      poster={display.poster}
      fallbackIcon={fallbackIcon}
      title={display.title}
      metaLine={display.metaLine}
      overview={display.overview}
      alreadyAdded
      onOpenExisting={onOpen}
    />
  );
}
