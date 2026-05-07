import type { ComponentType } from "react";
import { Image } from "expo-image";
import type { SvgProps } from "react-native-svg";
import { useUiScale } from "@/hooks/use-ui-scale";
import type { ServiceId } from "@/lib/constants";

import QbittorrentLogo from "@/assets/services/qbittorrent.svg";
import JellyfinLogo from "@/assets/services/jellyfin.svg";
import OverseerrLogo from "@/assets/services/overseerr.svg";
import PlexLogo from "@/assets/services/plex.svg";

const SVG_LOGOS: Partial<Record<ServiceId, ComponentType<SvgProps>>> = {
  qbittorrent: QbittorrentLogo,
  jellyfin: JellyfinLogo,
  overseerr: OverseerrLogo,
  plex: PlexLogo,
};

const PNG_LOGOS: Partial<Record<ServiceId, number>> = {
  radarr: require("@/assets/services/radarr.png"),
  sonarr: require("@/assets/services/sonarr.png"),
  prowlarr: require("@/assets/services/prowlarr.png"),
  tautulli: require("@/assets/services/tautulli.png"),
  bazarr: require("@/assets/services/bazarr.png"),
  glances: require("@/assets/services/glances.png"),
};

export function hasServiceLogo(id: ServiceId): boolean {
  return id in SVG_LOGOS || id in PNG_LOGOS;
}

interface ServiceLogoProps {
  id: ServiceId;
  size: number;
  online?: boolean;
}

export function ServiceLogo({ id, size, online = true }: ServiceLogoProps) {
  const scale = useUiScale();
  const px = Math.round(size * scale);
  const opacity = online ? 1 : 0.4;

  const SvgLogo = SVG_LOGOS[id];
  if (SvgLogo) {
    return <SvgLogo width={px} height={px} opacity={opacity} />;
  }

  const png = PNG_LOGOS[id];
  if (png != null) {
    return (
      <Image
        source={png}
        style={{ width: px, height: px, opacity }}
        contentFit="contain"
      />
    );
  }

  return null;
}
