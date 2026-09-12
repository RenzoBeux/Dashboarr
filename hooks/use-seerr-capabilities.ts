import { useMemo } from "react";
import { useSeerrMe } from "@/hooks/use-overseerr";
import {
  deriveSeerrCapabilities,
  type SeerrCapabilities,
} from "@/lib/seerr-permissions";

/** Capabilities plus why they could not be loaded, when they could not. */
export interface SeerrCapabilityState extends SeerrCapabilities {
  /** The /auth/me failure, when `loaded` is false because of one. */
  error: Error | null;
}

/**
 * What the account behind a Seerr instance may do (#332).
 *
 * `loaded` is false until /auth/me has answered; action controls hide behind
 * it so a signed-in non-admin never sees a button that would 403. After the
 * first fetch the identity is cached (and seeded from the session cache the
 * probe or login already filled), so an admin sees the pre-#332 UI with no
 * flicker. Stable per `me` payload, so it is safe in effect dependencies.
 *
 * `error` is the other way `loaded` stays false. Every surface that gates on
 * `loaded` must also render `error`, otherwise a wrong key or an unreachable
 * host looks like a permanent spinner (or a title with no Request button)
 * instead of the failure it is.
 *
 * `active` false leaves the query unmounted (no /auth/me at all), for callers
 * that only need the identity under some configurations.
 */
export function useSeerrCapabilities(
  instanceId?: string,
  active = true,
): SeerrCapabilityState {
  const { data, error } = useSeerrMe(instanceId, active);
  return useMemo(
    () => ({ ...deriveSeerrCapabilities(data), error: error ?? null }),
    [data, error],
  );
}
