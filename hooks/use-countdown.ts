import { useEffect, useRef, useState } from "react";

/**
 * A once-per-second countdown anchored to an absolute deadline.
 *
 * The anchor is the point. Pi-hole's `timer` is remaining seconds AT THE MOMENT
 * FTL ANSWERED, so seeding `useState(timer)` and decrementing it is wrong in
 * three separate ways:
 *
 *   1. React Query serves cached data on re-entry (global staleTime 5s, gcTime
 *      5min), so a fresh mount re-seeds from a stale `timer` and the countdown
 *      visibly jumps BACKWARDS.
 *   2. iOS freezes JS timers on background, so a decrementing counter is wrong
 *      by exactly the time spent backgrounded — and focusManager pauses the
 *      refetch that would have corrected it.
 *   3. Drift accumulates, because setInterval is not precise.
 *
 * Recomputing from `anchorMs` on every tick fixes all three at once: the value
 * is always `seconds - (now - anchor)`, which is correct on first paint, after
 * backgrounding, and forever. Pass React Query's own `dataUpdatedAt` as the
 * anchor — it only advances on a successful fetch, which is exactly the instant
 * `seconds` was measured.
 *
 * Returns null when there is nothing counting down (a permanent state), and
 * runs no interval in that case.
 */
export function useCountdown(
  seconds: number | null | undefined,
  anchorMs: number | undefined,
  onExpire?: () => void,
): number | null {
  const compute = (): number | null => {
    if (seconds == null || anchorMs == null) return null;
    const elapsed = (Date.now() - anchorMs) / 1000;
    return Math.max(0, seconds - elapsed);
  };

  const [remaining, setRemaining] = useState<number | null>(compute);

  // Keep the callback in a ref so a new inline arrow on every render does not
  // restart the interval (which would reset the tick phase constantly).
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // One fire per countdown, not one per tick at zero.
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const next = compute();
    setRemaining(next);
    if (next === null) return;

    // Already expired when it arrived (e.g. resumed from background onto stale
    // data) — tell the caller to refetch immediately rather than waiting a tick.
    if (next <= 0) {
      firedRef.current = true;
      onExpireRef.current?.();
      return;
    }

    const id = setInterval(() => {
      const value = compute();
      setRemaining(value);
      if (value !== null && value <= 0 && !firedRef.current) {
        firedRef.current = true;
        // The server re-enables on its own schedule and may be a moment late,
        // so the caller refetches rather than flipping local state.
        onExpireRef.current?.();
      }
    }, 1000);
    return () => clearInterval(id);
    // compute closes over exactly these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, anchorMs]);

  return remaining;
}
