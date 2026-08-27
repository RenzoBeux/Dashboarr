import type { ComponentType } from "react";
import { Image } from "expo-image";
import type { SvgProps } from "react-native-svg";
import { useUiScale } from "@/hooks/use-ui-scale";
import type { ServiceId } from "@/lib/constants";

import QbittorrentLogo from "@/assets/services/qbittorrent.svg";
import TransmissionLogo from "@/assets/services/transmission.svg";
import SabnzbdLogo from "@/assets/services/sabnzbd.svg";
import NzbgetLogo from "@/assets/services/nzbget.svg";
import JellyfinLogo from "@/assets/services/jellyfin.svg";
import EmbyLogo from "@/assets/services/emby.svg";
import OverseerrLogo from "@/assets/services/overseerr.svg";
import PlexLogo from "@/assets/services/plex.svg";
import UnraidLogo from "@/assets/services/unraid.svg";

const SVG_LOGOS: Partial<Record<ServiceId, ComponentType<SvgProps>>> = {
  qbittorrent: QbittorrentLogo,
  transmission: TransmissionLogo,
  sabnzbd: SabnzbdLogo,
  nzbget: NzbgetLogo,
  jellyfin: JellyfinLogo,
  emby: EmbyLogo,
  overseerr: OverseerrLogo,
  plex: PlexLogo,
  unraid: UnraidLogo,
};

const PNG_LOGOS: Partial<Record<ServiceId, number>> = {
  // Official ruTorrent mark (the rtorrent/ruTorrent stack has no public vector).
  rtorrent: require("@/assets/services/rtorrent.png"),
  // Official Deluge droplet (GPL-3.0, deluge-torrent/deluge
  // deluge/ui/data/icons/hicolor/256x256/apps/deluge.png). Upstream ships a
  // vector too, but it is a 21 KB Inkscape file with 53 gradients — the raster
  // is the cheaper mark to render. Blue-on-transparent, so it reads on the dark
  // UI as shipped.
  deluge: require("@/assets/services/deluge.png"),
  radarr: require("@/assets/services/radarr.png"),
  sonarr: require("@/assets/services/sonarr.png"),
  lidarr: require("@/assets/services/lidarr.png"),
  // Bindery's official mark (MIT, vavallee/bindery .github/assets/logo.png),
  // downscaled to 256px to match its siblings.
  bindery: require("@/assets/services/bindery.png"),
  prowlarr: require("@/assets/services/prowlarr.png"),
  // Official Jackett jacket glyph, recolored white for the dark UI (upstream
  // ships it black-on-transparent).
  jackett: require("@/assets/services/jackett.png"),
  tautulli: require("@/assets/services/tautulli.png"),
  tracearr: require("@/assets/services/tracearr.png"),
  jellystat: require("@/assets/services/jellystat.png"),
  bazarr: require("@/assets/services/bazarr.png"),
  glances: require("@/assets/services/glances.png"),
  // Official autobrr rabbit (GPL-2.0, autobrr/autobrr web/public/logo192.png).
  // Blue-on-transparent, so it reads fine on the dark UI as shipped.
  autobrr: require("@/assets/services/autobrr.png"),
  // Official Cleanuparr mark (MPL-2.0, Cleanuparr/Cleanuparr
  // code/frontend/public/icons/icon-192x192.png). Purple-on-transparent with
  // black cutouts that blend into the dark UI, as on Cleanuparr's own UI.
  cleanuparr: require("@/assets/services/cleanuparr.png"),
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
