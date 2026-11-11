// Pure helpers behind hooks/use-service-image.ts, kept free of React Native so
// they unit-test without the store shims.

/** True for an absolute http(s) URL an <Image> can load as-is. */
export function isHttpUrl(u: string | null | undefined): u is string {
  return !!u && /^https?:\/\//i.test(u);
}

/**
 * Rewrites an *arr `/MediaCover/...` image path (which the web UI serves
 * behind session auth) to the API route that accepts `apikey`, using the
 * -500 resized variant. Any other path is returned unchanged.
 *
 * Radarr/Sonarr serve `<api>/MediaCover/{id}/{file}`. Lidarr splits the
 * route by entity (`Lidarr.Api.V1/MediaCovers/MediaCoverController.cs`):
 * `<api>/MediaCover/artist/{id}/{file}` and `<api>/MediaCover/album/{id}/{file}`,
 * while its `url` field reads `/MediaCover/{id}/...` and
 * `/MediaCover/Albums/{id}/...` (#511).
 *
 * A missing resized variant is fine: every controller falls back to the
 * full-size file when the `-NNN` one doesn't exist (e.g. fanart, which is
 * resized to 360/180, not 500).
 */
export function toApiMediaCoverPath(
  path: string,
  serviceId: string,
  apiBasePath: string,
): string {
  if (!/^\/MediaCover\//i.test(path)) return path;
  let p = path;
  if (serviceId === "lidarr") {
    const m = p.match(/^\/MediaCover\/(Albums\/)?(\d+)\/(.+)$/i);
    if (m) p = `/MediaCover/${m[1] ? "album" : "artist"}/${m[2]}/${m[3]}`;
  }
  // Use the -500 variant (e.g. poster-500.jpg) to avoid blowing Fresco's memory pool.
  p = p.replace(/\/(poster|banner|fanart|cover)\.jpg/i, "/$1-500.jpg");
  return `${apiBasePath}${p}`;
}
