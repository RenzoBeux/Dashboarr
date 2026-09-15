/**
 * Which of an instance's two URLs the backend pollers use. Shared by
 * services/http.ts (to build requests) and ui/overview.ts (to tell the web
 * UI which one to highlight) so the two can never disagree.
 *
 * The preferred side comes from BACKEND_USE_REMOTE; the app's own useRemote
 * flag is ignored server-side. When the preferred URL is empty the other one
 * is used, so a user who only filled in one of the two is not stuck.
 */
export type UrlSide = "local" | "remote";

export function activeUrlSide(
  localUrl: string,
  remoteUrl: string,
  preferRemote: boolean,
): UrlSide | null {
  const primary: UrlSide = preferRemote ? "remote" : "local";
  const secondary: UrlSide = preferRemote ? "local" : "remote";
  const value = (side: UrlSide) => (side === "local" ? localUrl : remoteUrl);
  if (value(primary)) return primary;
  if (value(secondary)) return secondary;
  return null;
}
