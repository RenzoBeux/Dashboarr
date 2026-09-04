/**
 * Sonarr and Radarr do not put a freshly grabbed release into `/queue`
 * synchronously. `DownloadMonitoringService` handles the grabbed event through
 * a *trailing* 5s debouncer (NzbDrone.Common/TPL/Debouncer.cs — `Execute()`
 * only starts the timer, the action runs on `Elapsed`), which then pushes a
 * `RefreshMonitoredDownloads` command that still has to be dequeued and
 * round-trip the download client before the item becomes trackable.
 *
 * So the `invalidateQueries` the grab mutation fires the instant
 * `POST /release` resolves always reads a queue that doesn't contain the grab
 * yet: the row stays red instead of turning purple until the next 30s poll
 * (#401). These offsets straddle that window — 0 catches a delay-profile grab
 * (pending releases are queued immediately), then two re-checks past the
 * debounce plus command and download-client latency. Anything slower falls back
 * to the normal poll.
 */
export const POST_GRAB_RECHECK_MS = [0, 6_000, 14_000] as const;

const bursts = new Map<string, ReturnType<typeof setTimeout>[]>();

/**
 * Calls `refetch` at each offset, replacing any burst already scheduled under
 * the same `id` so grabbing several releases in a row can't stack timers.
 *
 * The timers are module-level on purpose: the release sheet unmounts as soon as
 * the grab succeeds, and the re-checks have to outlive it to land on whatever
 * screen the user navigated back to.
 */
export function scheduleGrabRecheck(
  id: string,
  refetch: () => void,
  offsets: readonly number[] = POST_GRAB_RECHECK_MS,
): void {
  cancelGrabRecheck(id);
  let remaining = offsets.length;
  bursts.set(
    id,
    offsets.map((ms) =>
      setTimeout(() => {
        remaining -= 1;
        if (remaining === 0) bursts.delete(id);
        refetch();
      }, ms),
    ),
  );
}

export function cancelGrabRecheck(id: string): void {
  bursts.get(id)?.forEach(clearTimeout);
  bursts.delete(id);
}
