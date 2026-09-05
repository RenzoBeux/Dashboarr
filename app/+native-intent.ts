import { DASHBOARD_STACK_PREFIX } from "@/lib/tab-routes";

// Content details live in several tab stacks (#330). An OS link carries no
// tab context, so pin it to the Dashboard stack: always present, always
// pinned, and expo-router inserts the Dashboard root underneath so back works.
// Covers the Android calendar widget's baked-in /series and /movie links.
const CONTENT_DEEP_LINK = /^(?:series|movie)\//;

// "dashboarr:///series/1", "dashboarr-dev://series/1", "/series/1" -> "series/1".
// The scheme differs per build variant (app.config.ts), so strip any scheme.
function relativePath(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\/+/, "");
}

// Rewrites OS-delivered URLs before expo-router routes them. Magnet links
// (registered via the "magnet" entry in app.config.ts `scheme`) are not valid
// routes, so they're redirected to the Downloads tab which prefills the add
// card from the `magnet` param. Returns bare paths: expo-router accepts "/..."
// here on cold and warm starts, whereas a scheme-prefixed "(tabs)" segment
// would be parsed as a URL host.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.startsWith("magnet:")) {
      return `/downloads?magnet=${encodeURIComponent(path)}`;
    }
    const relative = relativePath(path);
    if (CONTENT_DEEP_LINK.test(relative)) {
      return `${DASHBOARD_STACK_PREFIX}/${relative}`;
    }
    return path;
  } catch {
    // expo-router requirement: never throw here; fall back to the home route.
    return "/";
  }
}
