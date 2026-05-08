// `new URL("/api/v3", base)` discards base.pathname because path-absolute
// inputs override the base path per the URL spec. That breaks reverse-proxy
// setups like http://host/radarr where the /radarr prefix must be preserved.
// Concatenate explicitly and encode params manually with encodeURIComponent
// so spaces become %20 — React Native's URLSearchParams polyfill emits `+`
// for spaces, which Overseerr/TMDB does not decode back to a space, breaking
// multi-word searches like "the rock".
export function buildUrl(
  baseUrl: string,
  apiBasePath: string,
  path: string,
  params?: Record<string, string | number | boolean>,
): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const fullPath = `${trimmedBase}${apiBasePath}${path}`;
  const entries = params ? Object.entries(params) : [];
  if (entries.length === 0) {
    return fullPath;
  }
  const query = entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
  const separator = fullPath.includes("?") ? "&" : "?";
  return `${fullPath}${separator}${query}`;
}
