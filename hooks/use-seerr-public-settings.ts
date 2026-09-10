import { useQuery } from "@tanstack/react-query";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { buildUrl } from "@/lib/url-builder";
import { readSeerrPublicSettings, type SeerrPublicSettings } from "@/lib/seerr-auth";

/**
 * Which sign-in methods a Seerr offers, for the editor's mode picker (#332).
 *
 * GET /settings/public is anonymous on both forks, so this needs no
 * credential and can run against the unsaved form URL. Failures resolve to
 * `null` rather than throwing: `availableSeerrSignInModes(null)` offers every
 * mode, because a reverse-proxy hiccup must never hide the one the user is
 * about to configure. The result only narrows the list; the server still
 * checks each method when the login is attempted.
 */
export function useSeerrPublicSettings(
  url: string,
  customHeaders: Record<string, string>,
  enabled: boolean,
) {
  const globalHeaders = useConfigStore((s) => s.globalCustomHeaders);
  const headersKey = JSON.stringify({ ...globalHeaders, ...customHeaders });
  return useQuery<SeerrPublicSettings | null>({
    queryKey: ["seerr-public", url, headersKey],
    enabled: enabled && url.length > 0,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const headers = new Headers();
        for (const [k, v] of Object.entries({ ...globalHeaders, ...customHeaders })) {
          if (k.toLowerCase() === "cookie") continue;
          headers.set(k, v);
        }
        headers.set("Accept", "application/json");
        const res = await fetch(
          buildUrl(url, SERVICE_DEFAULTS.overseerr.apiBasePath, "/settings/public"),
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
