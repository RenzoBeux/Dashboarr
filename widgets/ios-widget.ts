import Constants from "expo-constants";
import { ExtensionStorage } from "@bacons/apple-targets";
import type { WidgetViewModel } from "@/widgets/fetch-agenda";
import { buildIosWidgetSnapshot } from "@/widgets/ios-widget-snapshot";

// Must match `kind` in targets/widget/Widgets.swift and the key it reads in
// targets/widget/ReleasingSoonSnapshot.swift.
export const IOS_WIDGET_KIND = "ReleasingSoon";
export const IOS_WIDGET_SNAPSHOT_KEY = "releasingSoon";

// The App Group from app.config.ts (per variant). Null when the running config
// has none, e.g. an OTA update on a binary built before the widget existed.
function appGroup(): string | null {
  const groups =
    Constants.expoConfig?.ios?.entitlements?.["com.apple.security.application-groups"];
  return Array.isArray(groups) && typeof groups[0] === "string" ? groups[0] : null;
}

// Hands the iOS widget a fresh agenda and asks WidgetKit to redraw it. Without
// the native module (Android, older binaries) ExtensionStorage is a no-op.
export function publishIosWidgetSnapshot(vm: WidgetViewModel, scheme: string): void {
  const group = appGroup();
  if (!group) return;
  const snapshot = buildIosWidgetSnapshot(vm, scheme, Date.now());
  new ExtensionStorage(group).set(IOS_WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
  ExtensionStorage.reloadWidget(IOS_WIDGET_KIND);
}
