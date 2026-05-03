// `new URL("/api/v3", base)` discards base.pathname because path-absolute
// inputs override the base path per the URL spec. That breaks reverse-proxy
// setups like http://host/radarr where the /radarr prefix must be preserved.
// Concatenate explicitly, normalize duplicate slashes from a trailing-slash
// base, then parse so `params` can be appended via searchParams.
export function buildUrl(
  baseUrl: string,
  apiBasePath: string,
  path: string,
  params?: Record<string, string | number | boolean>,
): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${trimmedBase}${apiBasePath}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
