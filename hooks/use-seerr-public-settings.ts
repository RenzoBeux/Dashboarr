import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { buildUrl } from "@/lib/url-builder";
import { seerrHeaders } from "@/lib/http-client";
import { validateServiceUrl } from "@/lib/url-validation";
import { readSeerrPublicSettings, type SeerrPublicSettings } from "@/lib/seerr-auth";

/** How long the URL field must be idle before it is probed. */
const SETTLE_MS = 800;

/**
 * Which sign-in methods a Seerr offers, for the editor's mode picker (#332).
 *
 * GET /settings/public is anonymous on both forks, so this needs no
 * credential and can run against the unsaved form URL. Failures resolve to
 * `null` rather than throwing: `availableSeerrSignInModes(null)` offers every
 * mode, because a reverse-proxy hiccup must never hide the one the user is
 * about to configure. The result only narrows the list; the server still
 * checks each method when the login is attempted.
 *
 * The URL is taken from the field as typed, so it is probed only once it has
 * been idle for SETTLE_MS and parses as a URL. Keyed on the live text, every
 * keystroke of "https://seerr.example.com" would send the instance's custom
 * headers (a reverse proxy's CF-Access or Authorization credentials) to
 * seerr.example.c, seerr.example.co and every other prefix that resolves.
 * The header filter is http-client's, so the same two names every Seerr
 * session call drops (Cookie, X-Api-Key) are dropped here.
 */
export function useSeerrPublicSettings(
  url: string,
  customHeaders: Record<string, string>,
  enabled: boolean,
) {
  const globalHeaders = useConfigStore((s) => s.globalCustomHeaders);
  const headersKey = JSON.stringify({ ...globalHeaders, ...customHeaders });
  const [settledUrl, setSettledUrl] = useState(url);
  useEffect(() => {
    if (url === settledUrl) return;
    const timer = setTimeout(() => setSettledUrl(url), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [url, settledUrl]);
  const probeUrl =
    settledUrl.length > 0 && validateServiceUrl(settledUrl, "local").kind !== "invalid"
      ? settledUrl
      : "";
  return useQuery<SeerrPublicSettings | null>({
    queryKey: ["seerr-public", probeUrl, headersKey],
    enabled: enabled && probeUrl.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const headers = seerrHeaders(
          { ...globalHeaders, ...customHeaders },
          { Accept: "application/json" },
        );
        const res = await fetch(
          buildUrl(probeUrl, SERVICE_DEFAULTS.overseerr.apiBasePath, "/settings/public"),
          { method: "GET", headers, signal: controller.signal },
        );
        if (!res.ok) return null;
        return readSeerrPublicSettings(await res.json().catch(() => null));
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
