import { Linking, Platform } from "react-native";

import { plexAppUrl, plexWebUrl } from "@/lib/plex-items";

/**
 * Open an item in Plex. On iOS the plex:// link opens the Plex app; Linking
 * rejects it when the app isn't installed, so we fall back to Plex Web.
 * Elsewhere Plex Web is the target (Overseerr makes the same split). Opening
 * a link is best-effort, never an error state.
 */
export async function openInPlex(machineIdentifier: string, ratingKey: string): Promise<void> {
  if (Platform.OS === "ios") {
    try {
      await Linking.openURL(plexAppUrl(machineIdentifier, ratingKey));
      return;
    } catch {
      // Plex app not installed: fall through to the web link.
    }
  }
  await Linking.openURL(plexWebUrl(machineIdentifier, ratingKey)).catch(() => {});
}
