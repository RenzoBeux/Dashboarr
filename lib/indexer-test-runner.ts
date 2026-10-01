// Per-row test bookkeeping shared by the Prowlarr and Jackett indexer lists
// (driven by hooks/use-indexer-test-runner.ts). Pure so the two invariants
// below are unit-tested rather than re-learned:
//
// 1. One key per (instance, row). A verdict is a point-in-time probe of one
//    server's indexer. The lists stay mounted across an instance switch and
//    ids collide across servers, so keyed by bare row id server A's "Working"
//    would sit beside server B's unrelated indexer. The key is taken when a
//    test STARTS, so a completion that lands after a switch is filed under the
//    server that produced it.
// 2. Pending is a set and results a map, both updated per key. TanStack's
//    `mutate` callbacks and `isPending`/`variables` follow only the LATEST call
//    (consecutive mutations replace the observer), so a second row started
//    while the first is in flight would drop the first's spinner and verdict.
//    The hook runs one `mutateAsync` per row and reduces the outcomes here.

export type TestKey = string;

export function testKey(
  instanceId: string | null | undefined,
  rowId: string | number,
): TestKey {
  return `${instanceId ?? ""}:${rowId}`;
}

export interface TestRunnerState<R> {
  pending: ReadonlySet<TestKey>;
  results: Readonly<Record<TestKey, R>>;
}

export function emptyTestRunnerState<R>(): TestRunnerState<R> {
  return { pending: new Set(), results: {} };
}

export function startTest<R>(
  state: TestRunnerState<R>,
  key: TestKey,
): TestRunnerState<R> {
  if (state.pending.has(key)) return state;
  const pending = new Set(state.pending);
  pending.add(key);
  return { pending, results: state.results };
}

export function finishTest<R>(
  state: TestRunnerState<R>,
  key: TestKey,
  result: R,
): TestRunnerState<R> {
  const pending = new Set(state.pending);
  pending.delete(key);
  return { pending, results: { ...state.results, [key]: result } };
}
