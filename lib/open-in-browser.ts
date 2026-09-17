import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Open a web page in the system in-app browser (SFSafariViewController on iOS,
 * a Chrome Custom Tab on Android). Unlike an embedded WebView it shares the
 * device browser's session, so a self-hosted admin UI the user is already
 * signed into opens signed in. Same pattern the Plex OAuth flow in
 * components/integrations/service-editor.tsx uses. Falls back to handing the
 * URL to the OS when no in-app browser is available (some Android builds
 * without a Custom Tabs provider); that fallback's own failure is the only
 * error surfaced to the caller.
 */
export async function openInBrowser(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}
