import type { OverseerrRequestOptions } from "@/services/overseerr-api";

/**
 * Resolve which Seerr account a new request is filed on behalf of (#332).
 *
 * Three states have to stay distinguishable, which is why this is not a `??`:
 *
 *   - no opinion    — `options` has no `userId` key. The instance's stored
 *                     "Request As" default applies. This is every call site
 *                     that predates the feature, including the one-tap request
 *                     in the media detail modal.
 *   - a choice      — `userId` is a number. It wins over the stored default.
 *   - "no one"      — `userId` is present but `undefined`. The request goes to
 *                     the API key's own identity even when a default is stored.
 *
 * That last state is the whole reason for testing key presence rather than
 * value: the request sheet's picker offers "API key owner", and with a `??`
 * fallback choosing it would silently re-apply the stored default instead.
 * `JSON.stringify` drops undefined values, so a present-but-undefined `userId`
 * never reaches the wire.
 */
export function resolveRequestUser(
  options: OverseerrRequestOptions | undefined,
  defaultUserId: number | undefined,
): OverseerrRequestOptions | undefined {
  if (options && "userId" in options) return options;
  if (defaultUserId === undefined) return options;
  return { ...(options ?? {}), userId: defaultUserId };
}
