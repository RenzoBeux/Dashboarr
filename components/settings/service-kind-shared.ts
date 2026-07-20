import { SERVICE_IDS, SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";

// Service kinds whose backend webhook integration uses ?instance=<uuid> to
// attribute events to a specific instance. Other kinds (qbittorrent, prowlarr,
// plex, jellyfin, glances) don't have a webhook integration, so the
// instance-id helper card is hidden for them.
export const WEBHOOK_KINDS = new Set<ServiceId>([
  "radarr",
  "sonarr",
  "tautulli",
  "overseerr",
  "bazarr",
  "tracearr",
]);

// Display name for the service kind (used in the main settings list, before
// the user picks an instance). Each instance also carries its own editable
// `name`, but the kind row needs a stable label.
export const SERVICE_DEFAULTS_KIND_LABEL: Record<ServiceId, string> = SERVICE_IDS.reduce(
  (acc, id) => {
    acc[id] = SERVICE_DEFAULTS[id].name;
    return acc;
  },
  {} as Record<ServiceId, string>,
);

// Module-level singletons for the "absent" case in store selectors. Returning
// `?? []` or `?? {}` from inside a Zustand selector creates a fresh reference
// on every store update, which Zustand reads as "value changed" and triggers
// a re-render — and if the consumer is a `useState`-bearing form like
// ServiceEditor, that re-render kicks the selector again, etc., until React
// throws "Maximum update depth exceeded". Using a stable empty value keeps
// the selector idempotent across non-mutating store updates.
export const EMPTY_INSTANCES: import("@/store/config-store").ServiceInstance[] = [];
export const EMPTY_SECRETS: import("@/store/config-store").ServiceSecrets = {};
