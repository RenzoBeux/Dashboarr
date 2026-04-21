import { useState, useCallback } from "react";
import { useConfigStore } from "@/store/config-store";
import { redactUrl } from "@/lib/http-client";
import type { ServiceId } from "@/lib/constants";

interface ServiceImage {
  url: string;
  remoteUrl: string;
}

/**
 * Resolves a service image URL with automatic fallback.
 * Tries local service URL first (with apikey query param), falls back to remoteUrl,
 * then returns undefined so the placeholder icon renders.
 */
export function useServiceImage(
  image: ServiceImage | undefined,
  serviceId: ServiceId,
) {
  const baseUrl = useConfigStore((s) => s.getActiveUrl(serviceId));
  const apiKey = useConfigStore((s) => s.secrets[serviceId]?.apiKey);
  const [failCount, setFailCount] = useState(0);

  // TMDB original images are ~6MB each — use w500 to avoid memory pool exhaustion
  const rawRemote = image?.remoteUrl || undefined;
  const remoteUrl = rawRemote?.replace("/t/p/original/", "/t/p/w500/");

  let localUrl: string | undefined;
  if (image?.url && baseUrl) {
    const base = baseUrl.replace(/\/+$/, "");
    let path = image.url.startsWith("/") ? image.url : `/${image.url}`;
    // Radarr/Sonarr return /MediaCover/... which requires session auth.
    // The API endpoint /api/v3/MediaCover/... accepts apikey auth.
    // Use -500 variant (e.g. poster-500.jpg) to avoid blowing Fresco's memory pool.
    if (path.startsWith("/MediaCover/")) {
      path = `/api/v3${path.replace(/\/(poster|banner|fanart)\.jpg/, "/$1-500.jpg")}`;
    }
    const separator = path.includes("?") ? "&" : "?";
    localUrl = `${base}${path}${apiKey ? `${separator}apikey=${apiKey}` : ""}`;
  }

  const candidates = [localUrl, remoteUrl].filter(
    (u): u is string => !!u,
  );
  const src = failCount < candidates.length ? candidates[failCount] : undefined;

  const onError = useCallback((e: { nativeEvent: { error?: string } }) => {
    const failed = failCount < candidates.length ? candidates[failCount] : "unknown";
    console.warn(
      `[ServiceImage] FAILED:`,
      failed === "unknown" ? failed : redactUrl(failed),
      `| reason:`,
      e?.nativeEvent?.error ?? "unknown",
    );
    setFailCount((c) => c + 1);
  }, [failCount, candidates]);

  return { src, onError };
}
