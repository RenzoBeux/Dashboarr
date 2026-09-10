import { useMemo } from "react";
import { useSeerrMe } from "@/hooks/use-overseerr";
import {
  deriveSeerrCapabilities,
  type SeerrCapabilities,
} from "@/lib/seerr-permissions";

/**
 * What the account behind a Seerr instance may do (#332).
 *
 * `loaded` is false until /auth/me has answered; action controls hide behind
 * it so a signed-in non-admin never sees a button that would 403. After the
 * first fetch the identity is cached (and seeded from the session cache the
 * probe or login already filled), so an admin sees the pre-#332 UI with no
 * flicker. Stable per `me` payload, so it is safe in effect dependencies.
 */
export function useSeerrCapabilities(instanceId?: string): SeerrCapabilities {
  const { data } = useSeerrMe(instanceId);
  return useMemo(() => deriveSeerrCapabilities(data), [data]);
}
