import { isAbortError } from "@/lib/http-client";

/**
 * Turns the backend transport's connection-level failures into something a user
 * can act on (issue #357).
 *
 * React Native's fetch rejects with a bare `TypeError: Network request failed`
 * for every pre-HTTP failure: DNS, connection refused, cleartext block, and —
 * the case that produced #357 — an untrusted TLS certificate. `toastError`
 * prefers `err.message` over the caller's fallback, so that raw string is what
 * the user saw, with nothing pointing at the actual cause.
 *
 * The service path already does this at `testServiceConnection`
 * (lib/http-client.ts); this is the backend path's equivalent, applied inside
 * `request()` so pairing, health, test push and Apprise all get it.
 */

/**
 * Errors carrying a numeric `.status` came from a real HTTP response and are
 * returned untouched, by reference. `pairClaim` depends on this: it only falls
 * through to its next scheme candidate when `.status` is absent, so wrapping an
 * HTTP error here would turn a definitive 401 into a pointless retry.
 */
function hasHttpStatus(err: unknown): boolean {
  return typeof (err as { status?: unknown } | null)?.status === "number";
}

/** Host of a request URL, for naming what we couldn't reach. */
function hostOf(url: string): string | null {
  try {
    const host = new URL(url).host;
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

export function describeBackendTransportError(err: unknown, url: string): unknown {
  if (hasHttpStatus(err)) return err;

  if (isAbortError(err)) {
    return new Error(
      "The backend didn't respond in time. Check the URL and that the server is reachable.",
      { cause: err },
    );
  }

  if (err instanceof TypeError) {
    const host = hostOf(url);
    const target = host ? `"${host}"` : "the backend";
    // Kept short on purpose: error toasts clamp to 4 lines
    // (LINE_CLAMP in components/ui/toast.tsx), and the actionable half must
    // survive that clamp. The self-signed/private-CA nuance is spelled out in
    // the toggle's own description, which is on screen right next to this.
    return new Error(
      `Can't reach ${target}. Check the URL, or turn on "Allow invalid ` +
        'certificates" here if its certificate is self-signed or from a private CA.',
      { cause: err },
    );
  }

  return err;
}
