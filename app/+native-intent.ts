// Rewrites OS-delivered URLs before expo-router routes them. Magnet links
// (registered via the "magnet" entry in app.config.ts `scheme`) are not valid
// routes, so they're redirected to the Downloads tab which prefills the add
// card from the `magnet` param.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.startsWith("magnet:")) {
      return `/downloads?magnet=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    // expo-router requirement: never throw here — fall back to the home route.
    return "/";
  }
}
