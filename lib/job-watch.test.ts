import { createJobWatch } from "./job-watch";

// Flush the awaited fetch inside a tick.
const flush = () => new Promise((r) => jest.requireActual<typeof import("timers")>("timers").setImmediate(r));

describe("createJobWatch", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = (queue: (number[] | null)[], opts: { maxMs?: number } = {}) => {
    const refresh = jest.fn();
    let call = 0;
    const fetchActiveJobIds = jest.fn(async () =>
      call < queue.length ? queue[call++] : [],
    );
    const watch = createJobWatch<string>({
      fetchActiveJobIds,
      refresh,
      intervalMs: 1000,
      maxMs: opts.maxMs ?? 60_000,
      fallbackDelaysMs: [3000, 10_000],
    });
    return { watch, refresh, fetchActiveJobIds };
  };

  const advance = async (ms: number) => {
    jest.advanceTimersByTime(ms);
    await flush();
  };

  it("refreshes at once, again when a job ends, and stops once the queue stays empty", async () => {
    const { watch, refresh, fetchActiveJobIds } = setup([[7], [7], [], []]);
    watch.track(["movie-1"]);
    expect(refresh).toHaveBeenCalledTimes(1);

    await advance(1000); // [7]
    await advance(1000); // [7]
    expect(refresh).toHaveBeenCalledTimes(1);

    await advance(1000); // [] — job 7 ended
    expect(refresh).toHaveBeenCalledTimes(2);

    await advance(1000); // [] again — done
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(refresh).toHaveBeenLastCalledWith(["movie-1"]);

    await advance(5000);
    expect(fetchActiveJobIds).toHaveBeenCalledTimes(4);
  });

  it("merges keys tracked while polling", async () => {
    const { watch, refresh } = setup([[1], [], []]);
    watch.track(["a"]);
    await advance(1000);
    watch.track(["b"]);
    await advance(1000);
    await advance(1000);
    expect(refresh).toHaveBeenLastCalledWith(["a", "b"]);
  });

  it("gives up at the deadline with a final refresh", async () => {
    const busy = Array.from({ length: 50 }, () => [9]);
    const { watch, refresh, fetchActiveJobIds } = setup(busy, { maxMs: 3000 });
    watch.track(["x"]);
    await advance(1000);
    await advance(1000);
    await advance(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    const calls = fetchActiveJobIds.mock.calls.length;
    await advance(5000);
    expect(fetchActiveJobIds.mock.calls.length).toBe(calls);
  });

  it("lets a long action extend the deadline, never shorten it", async () => {
    const busy = Array.from({ length: 50 }, () => [9]);
    const { watch, refresh } = setup(busy, { maxMs: 3000 });
    watch.track(["all"], { maxMs: 10_000 });
    watch.track(["row"]);
    for (let i = 0; i < 5; i++) await advance(1000);
    expect(refresh).toHaveBeenCalledTimes(2); // both tracks, no final yet
    for (let i = 0; i < 5; i++) await advance(1000);
    expect(refresh).toHaveBeenCalledTimes(3); // final refresh at 10s
  });

  it("tracks a key once however often it is passed, compared by value", async () => {
    const refresh = jest.fn();
    let call = 0;
    const queue = [[1], [], []];
    const watch = createJobWatch<string[]>({
      fetchActiveJobIds: async () => queue[call++] ?? [],
      refresh,
      intervalMs: 1000,
    });
    watch.track([["bazarr", "b1", "movie", "1"]]);
    watch.track([["bazarr", "b1", "movie", "1"]]);
    await advance(1000);
    await advance(1000);
    await advance(1000);
    expect(refresh).toHaveBeenLastCalledWith([["bazarr", "b1", "movie", "1"]]);
  });

  it("falls back to timed refreshes without a job list", async () => {
    const { watch, refresh } = setup([null]);
    watch.track(["x"]);
    await advance(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(3000);
    expect(refresh).toHaveBeenCalledTimes(2);
    await advance(7000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("reports when it starts and stops working", async () => {
    const onActiveChange = jest.fn();
    let call = 0;
    const queue = [[1], [], []];
    const watch = createJobWatch<string>({
      fetchActiveJobIds: async () => queue[call++] ?? [],
      refresh: jest.fn(),
      onActiveChange,
      intervalMs: 1000,
    });
    watch.track(["a"]);
    watch.track(["b"]);
    expect(onActiveChange.mock.calls).toEqual([[true]]);
    await advance(1000);
    await advance(1000);
    await advance(1000);
    expect(onActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it("does nothing after dispose", async () => {
    const { watch, refresh } = setup([[1], [], []]);
    watch.track(["x"]);
    watch.dispose();
    await advance(5000);
    watch.track(["y"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
