import { DASHBOARD_STACK_PREFIX } from "@/lib/tab-routes";

// Detail screens live in a multi-tab array group (#330), so each is registered
// in every tab stack that lists it. An OS link carries no tab context, and
// expo-router then resolves it into whichever group its route tree orders
// first — today "(books)", where no tab is highlighted and back pops to the
// Books root. So pin them to the Dashboard stack: always present, always
// pinned, and expo-router inserts the Dashboard root underneath so back works.
// Covers the Android calendar widget's baked-in /series and /movie links.
//
// The trailing "/" is load-bearing: it keeps the "/movies" and "/books" tab
// roots and "/series-search" from matching. The (dashboard,services,settings)
// screens are deliberately absent — they already resolve into "(dashboard)"
// cold, and pinning them would drag a /settings/... link out of the Settings
// stack the user is standing in. lib/tab-route-resolution.test.ts guards both
// halves against tree drift.
const SHARED_STACK_LINK =
  /^(?:album|artist|author|book|deluge|movie|nzb|sab|series|torrent|transmission)\//;

// "dashboarr:///series/1", "dashboarr-dev://series/1", "/series/1" -> "series/1".
// The scheme differs per build variant (app.config.ts), so strip any scheme.
function relativePath(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\/+/, "");
}

// A .torrent file handed to the app by the OS. iOS "Open in Dashboarr" (via
// the CFBundleDocumentTypes entry in app.config.ts) copies the file into the
// app's Documents/Inbox and opens a file:// URL; Android's VIEW intent filter
// (mime application/x-bittorrent, or a *.torrent path) delivers a content://
// or file:// URI. Nothing else the app registers for arrives on those schemes,
// so any content:// URL is a torrent by construction; file:// is checked by
// extension so a stray file link can't hijack the add card.
export function isTorrentFileUrl(url: string): boolean {
  if (/^content:\/\//i.test(url)) return true;
  if (!/^file:\/\//i.test(url)) return false;
  const pathname = url.split(/[?#]/)[0];
  return /\.torrent$/i.test(pathname);
}

// Rewrites OS-delivered URLs before expo-router routes them. Magnet links
// (registered via the "magnet" entry in app.config.ts `scheme`) and opened
// .torrent files are not valid routes, so they're redirected to the Downloads
// tab which prefills the add card from the `magnet` / `torrentFile` param.
// Returns bare paths: expo-router accepts "/..." here on cold and warm
// starts, whereas a scheme-prefixed "(tabs)" segment would be parsed as a URL
// host.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.startsWith("magnet:")) {
      return `/downloads?magnet=${encodeURIComponent(path)}`;
    }
    if (isTorrentFileUrl(path)) {
      return `/downloads?torrentFile=${encodeURIComponent(path)}`;
    }
    const relative = relativePath(path);
    if (SHARED_STACK_LINK.test(relative)) {
      return `${DASHBOARD_STACK_PREFIX}/${relative}`;
    }
    return path;
  } catch {
    // expo-router requirement: never throw here; fall back to the home route.
    return "/";
  }
}
