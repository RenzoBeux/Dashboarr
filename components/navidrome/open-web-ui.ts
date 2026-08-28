import { Linking } from "react-native";

import { getWebUiUrl } from "@/services/navidrome-api";

/**
 * Open a record in Navidrome's own web UI.
 *
 * getWebUiUrl returns "" when the instance or its URL can't be resolved, which
 * Linking would reject — so the no-op guard here is the difference between
 * "nothing happens" and an unhandled rejection. The .catch matches every other
 * external-link call site in the app (no OS handler for the scheme, user
 * dismissed the chooser): opening a link is best-effort, never an error state.
 */
export function openNavidromeWebUi(
  resource: "album" | "artist" | "playlist" | "song",
  id?: string,
  instanceId?: string,
): void {
  const url = getWebUiUrl(resource, id, instanceId);
  if (!url) return;
  void Linking.openURL(url).catch(() => {});
}
