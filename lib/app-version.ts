import { Platform } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

export const NATIVE_VERSION: string =
  Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "unknown";

export const RUNTIME_VERSION: string =
  (typeof Updates.runtimeVersion === "string" && Updates.runtimeVersion) || NATIVE_VERSION;

export const UPDATE_CHANNEL: string | null = Updates.channel || null;

export function getCurrentUpdateId(): string | null {
  return Updates.updateId || null;
}

export interface OtaCheckResult {
  available: boolean;
  manifestId?: string | null;
}

export async function checkForOtaUpdate(): Promise<OtaCheckResult> {
  if (!Updates.isEnabled) return { available: false };
  const result = await Updates.checkForUpdateAsync();
  if (!result.isAvailable) return { available: false };
  const manifest = result.manifest as { id?: string } | undefined;
  return { available: true, manifestId: manifest?.id ?? null };
}

export async function downloadAndApplyOtaUpdate(): Promise<void> {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}

const IOS_BUNDLE_ID = "com.dashboarr.app";
const ANDROID_PACKAGE = "com.dashboarr.app";

export interface StoreVersionResult {
  storeVersion: string | null;
  storeUrl: string;
  hasUpdate: boolean;
  /** True when we couldn't reach the store or parse a version. */
  unknown: boolean;
}

export async function checkStoreVersion(): Promise<StoreVersionResult> {
  if (Platform.OS === "ios") return checkAppStoreVersion();
  if (Platform.OS === "android") return checkPlayStoreVersion();
  return {
    storeVersion: null,
    storeUrl: "",
    hasUpdate: false,
    unknown: true,
  };
}

async function checkAppStoreVersion(): Promise<StoreVersionResult> {
  const url = `https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE_ID}`;
  const fallbackStoreUrl = `https://apps.apple.com/app/${IOS_BUNDLE_ID}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { storeVersion: null, storeUrl: fallbackStoreUrl, hasUpdate: false, unknown: true };
    }
    const data = (await res.json()) as {
      resultCount?: number;
      results?: Array<{ version?: string; trackViewUrl?: string }>;
    };
    const entry = data.results?.[0];
    const storeVersion = entry?.version ?? null;
    const storeUrl = entry?.trackViewUrl ?? fallbackStoreUrl;
    if (!storeVersion) {
      return { storeVersion: null, storeUrl, hasUpdate: false, unknown: true };
    }
    return {
      storeVersion,
      storeUrl,
      hasUpdate: compareVersions(storeVersion, NATIVE_VERSION) > 0,
      unknown: false,
    };
  } catch {
    return { storeVersion: null, storeUrl: fallbackStoreUrl, hasUpdate: false, unknown: true };
  }
}

async function checkPlayStoreVersion(): Promise<StoreVersionResult> {
  const storeUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&hl=en`;
  try {
    const res = await fetch(storeUrl, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) {
      return { storeVersion: null, storeUrl, hasUpdate: false, unknown: true };
    }
    const html = await res.text();
    const storeVersion = extractPlayStoreVersion(html);
    if (!storeVersion) {
      return { storeVersion: null, storeUrl, hasUpdate: false, unknown: true };
    }
    return {
      storeVersion,
      storeUrl,
      hasUpdate: compareVersions(storeVersion, NATIVE_VERSION) > 0,
      unknown: false,
    };
  } catch {
    return { storeVersion: null, storeUrl, hasUpdate: false, unknown: true };
  }
}

// Play Store doesn't expose a stable JSON API. The version appears in a few
// inline data structures in the page HTML. We try the most common patterns,
// fall through on miss, and the caller treats "unknown" as "open the store
// and let the user check manually."
function extractPlayStoreVersion(html: string): string | null {
  const patterns = [
    /\[\[\["((?:\d+\.){1,3}\d+)"\]\]/,
    /"softwareVersion"\s*:\s*"((?:\d+\.){1,3}\d+)"/i,
    />Current Version<[\s\S]{0,200}?>((?:\d+\.){1,3}\d+)</i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}
