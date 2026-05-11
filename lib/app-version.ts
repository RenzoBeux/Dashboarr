import { Platform } from "react-native";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import * as Application from "expo-application";

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

// Read the live bundle id/package from the installed binary so a sideloaded
// dev variant (com.dashboarr.app.dev) doesn't falsely compare itself against
// the prod store listing. Falls back to prod for typings — at runtime
// Application.applicationId is always populated on iOS/Android.
const IOS_BUNDLE_ID = Application.applicationId ?? "com.dashboarr.app";
const ANDROID_PACKAGE = Application.applicationId ?? "com.dashboarr.app";
const GITHUB_REPO = "RenzoBeux/Dashboarr";

export type UpdateSource = "app-store" | "play-store" | "github";

export interface StoreVersionResult {
  storeVersion: string | null;
  storeUrl: string;
  hasUpdate: boolean;
  /** True when we couldn't reach the store or parse a version. */
  unknown: boolean;
  /** Where the version came from. null on unsupported platforms. */
  source: UpdateSource | null;
}

export async function checkStoreVersion(): Promise<StoreVersionResult> {
  if (Platform.OS === "ios") return checkAppStoreVersion();
  if (Platform.OS === "android") return checkAndroidVersion();
  return {
    storeVersion: null,
    storeUrl: "",
    hasUpdate: false,
    unknown: true,
    source: null,
  };
}

// On Android we have two distribution channels: Play Store and sideloaded APK
// (de-googled phones, F-Droid-style users). Use the Play Install Referrer as
// a heuristic — Play installs return a non-empty referrer string (timestamps
// at minimum), sideloads and de-googled phones either throw (no Play Services)
// or return empty.
async function checkAndroidVersion(): Promise<StoreVersionResult> {
  let referrer = "";
  try {
    referrer = (await Application.getInstallReferrerAsync()) ?? "";
  } catch {
    // No Play Services / not a Play install — fall through to GitHub.
  }
  if (referrer.trim().length > 0) return checkPlayStoreVersion();
  return checkGithubReleaseVersion();
}

async function checkAppStoreVersion(): Promise<StoreVersionResult> {
  const url = `https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE_ID}`;
  const fallbackStoreUrl = `https://apps.apple.com/app/${IOS_BUNDLE_ID}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { storeVersion: null, storeUrl: fallbackStoreUrl, hasUpdate: false, unknown: true, source: "app-store" };
    }
    const data = (await res.json()) as {
      resultCount?: number;
      results?: Array<{ version?: string; trackViewUrl?: string }>;
    };
    const entry = data.results?.[0];
    const storeVersion = entry?.version ?? null;
    const storeUrl = entry?.trackViewUrl ?? fallbackStoreUrl;
    if (!storeVersion) {
      return { storeVersion: null, storeUrl, hasUpdate: false, unknown: true, source: "app-store" };
    }
    return {
      storeVersion,
      storeUrl,
      hasUpdate: compareVersions(storeVersion, NATIVE_VERSION) > 0,
      unknown: false,
      source: "app-store",
    };
  } catch {
    return { storeVersion: null, storeUrl: fallbackStoreUrl, hasUpdate: false, unknown: true, source: "app-store" };
  }
}

async function checkPlayStoreVersion(): Promise<StoreVersionResult> {
  const storeUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&hl=en`;
  try {
    const res = await fetch(storeUrl, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) {
      return { storeVersion: null, storeUrl, hasUpdate: false, unknown: true, source: "play-store" };
    }
    const html = await res.text();
    const storeVersion = extractPlayStoreVersion(html);
    if (!storeVersion) {
      return { storeVersion: null, storeUrl, hasUpdate: false, unknown: true, source: "play-store" };
    }
    return {
      storeVersion,
      storeUrl,
      hasUpdate: compareVersions(storeVersion, NATIVE_VERSION) > 0,
      unknown: false,
      source: "play-store",
    };
  } catch {
    return { storeVersion: null, storeUrl, hasUpdate: false, unknown: true, source: "play-store" };
  }
}

async function checkGithubReleaseVersion(): Promise<StoreVersionResult> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const fallbackUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;
  try {
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      return { storeVersion: null, storeUrl: fallbackUrl, hasUpdate: false, unknown: true, source: "github" };
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const tag = data.tag_name?.replace(/^v/i, "").trim() || null;
    const releaseUrl = data.html_url ?? fallbackUrl;
    if (!tag) {
      return { storeVersion: null, storeUrl: releaseUrl, hasUpdate: false, unknown: true, source: "github" };
    }
    return {
      storeVersion: tag,
      storeUrl: releaseUrl,
      hasUpdate: compareVersions(tag, NATIVE_VERSION) > 0,
      unknown: false,
      source: "github",
    };
  } catch {
    return { storeVersion: null, storeUrl: fallbackUrl, hasUpdate: false, unknown: true, source: "github" };
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
