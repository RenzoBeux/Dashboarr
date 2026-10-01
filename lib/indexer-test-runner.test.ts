import {
  emptyTestRunnerState,
  finishTest,
  startTest,
  testKey,
  type TestRunnerState,
} from "./indexer-test-runner";

type Verdict = { ok: boolean; error?: string };

describe("testKey", () => {
  it("keeps the same row id apart across instances", () => {
    expect(testKey("server-a", 7)).not.toBe(testKey("server-b", 7));
  });

  it("is stable for the same instance and row", () => {
    expect(testKey("server-a", "1337x")).toBe(testKey("server-a", "1337x"));
  });

  it("tolerates a missing instance", () => {
    expect(testKey(null, 7)).toBe(testKey(undefined, 7));
  });
});

describe("startTest / finishTest", () => {
  const a = testKey("server-a", 1);
  const b = testKey("server-a", 2);

  it("marks a row pending without touching results", () => {
    const next = startTest(emptyTestRunnerState<Verdict>(), a);
    expect(next.pending.has(a)).toBe(true);
    expect(next.results).toEqual({});
  });

  it("is a no-op for a row that is already pending", () => {
    const once = startTest(emptyTestRunnerState<Verdict>(), a);
    expect(startTest(once, a)).toBe(once);
  });

  // The PR #459 review case: start B while A is in flight, then A completes.
  // A keeps its verdict and B keeps its spinner.
  it("keeps overlapping rows independent", () => {
    let state: TestRunnerState<Verdict> = emptyTestRunnerState();
    state = startTest(state, a);
    state = startTest(state, b);
    state = finishTest(state, a, { ok: true });

    expect(state.pending.has(a)).toBe(false);
    expect(state.pending.has(b)).toBe(true);
    expect(state.results[a]).toEqual({ ok: true });
    expect(state.results[b]).toBeUndefined();
  });

  it("replaces an earlier verdict for the same row", () => {
    let state: TestRunnerState<Verdict> = emptyTestRunnerState();
    state = finishTest(state, a, { ok: false, error: "down" });
    state = finishTest(startTest(state, a), a, { ok: true });
    expect(state.results[a]).toEqual({ ok: true });
  });

  // A completion that lands after the user switched instances is filed under
  // the server that produced it, so the other server's same-id row shows
  // nothing.
  it("scopes a late completion to the instance the test started on", () => {
    const onA = testKey("server-a", 7);
    const onB = testKey("server-b", 7);
    let state: TestRunnerState<Verdict> = emptyTestRunnerState();
    state = startTest(state, onA);
    state = finishTest(state, onA, { ok: true });

    expect(state.results[onA]).toEqual({ ok: true });
    expect(state.results[onB]).toBeUndefined();
    expect(state.pending.has(onB)).toBe(false);
  });

  it("never mutates the state it was given", () => {
    const initial = emptyTestRunnerState<Verdict>();
    const started = startTest(initial, a);
    finishTest(started, a, { ok: true });

    expect(initial.pending.size).toBe(0);
    expect(started.pending.has(a)).toBe(true);
    expect(started.results).toEqual({});
  });
});
