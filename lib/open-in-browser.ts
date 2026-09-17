import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Open a web page in the system in-app browser (SFSafariViewController on iOS,
 * a Chrome Custom Tab on Android), the same surface the Plex OAuth flow in
 * components/integrations/service-editor.tsx uses. Cookie sharing differs per
 * platform and must not be promised in UI copy: a Custom Tab shares Chrome's
 * cookies, but since iOS 11 SFSafariViewController keeps its own store, so an
 * existing Safari login does not carry over there. Falls back to handing the
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
