import { SERVICE_IDS, type ServiceId } from "@/lib/constants";

const VALID = new Set<ServiceId>(SERVICE_IDS);

/**
 * Materialize the user's display order for service kinds: entries the user
 * has explicitly ordered (via the Services tab Reorder mode or the Status
 * widget settings) first, then any SERVICE_IDS missing from that list
 * appended in canonical order. Unknown ids are dropped.
 *
 * Shared between the Services tab and the dashboard Status widget so both
 * surfaces agree on one ordering preference.
 */
export function applyServicesOrder(order: readonly ServiceId[]): ServiceId[] {
  const seen = new Set<ServiceId>();
  const out: ServiceId[] = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    if (!VALID.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of SERVICE_IDS) {
    if (seen.has(id)) continue;
    out.push(id);
  }
  return out;
}
