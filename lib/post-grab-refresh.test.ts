import { POLLING_INTERVALS } from "@/lib/constants";
import {
  cancelGrabRecheck,
  scheduleGrabRecheck,
} from "@/lib/post-grab-refresh";

// Sonarr/Radarr only publish a grab to /queue after a trailing 5s debounce plus
// a download-client round trip.
const GRAB_DEBOUNCE_MS = 5_000;

describe("scheduleGrabRecheck", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    cancelGrabRecheck("a");
    cancelGrabRecheck("b");
    jest.useRealTimers();
  });

  it("re-checks at every offset", () => {
    const refetch = jest.fn();
    scheduleGrabRecheck("a", refetch, [0, 100, 250]);

    expect(refetch).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(0);
    expect(refetch).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);
    expect(refetch).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(150);
    expect(refetch).toHaveBeenCalledTimes(3);

    jest.advanceTimersByTime(10_000);
    expect(refetch).toHaveBeenCalledTimes(3);
  });

  // The whole point of the burst: land at least one refetch after the server
  // has published the grab but before the normal queue poll would have.
  it("re-checks between the server debounce and the next queue poll", () => {
    const refetch = jest.fn();
    scheduleGrabRecheck("a", refetch);

    jest.advanceTimersByTime(GRAB_DEBOUNCE_MS);
    const beforeDebounceElapsed = refetch.mock.calls.length;
    jest.advanceTimersByTime(POLLING_INTERVALS.queue - GRAB_DEBOUNCE_MS);
    expect(refetch.mock.calls.length).toBeGreaterThan(beforeDebounceElapsed);
  });

  it("replaces a burst already scheduled under the same id", () => {
    const first = jest.fn();
    const second = jest.fn();
    scheduleGrabRecheck("a", first, [100, 200]);
    scheduleGrabRecheck("a", second, [100, 200]);

    jest.advanceTimersByTime(500);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("keeps bursts under different ids independent", () => {
    const a = jest.fn();
    const b = jest.fn();
    scheduleGrabRecheck("a", a, [100]);
    scheduleGrabRecheck("b", b, [100]);

    jest.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("cancels pending re-checks", () => {
    const refetch = jest.fn();
    scheduleGrabRecheck("a", refetch, [100, 200]);
    jest.advanceTimersByTime(100);
    cancelGrabRecheck("a");

    jest.advanceTimersByTime(1_000);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
