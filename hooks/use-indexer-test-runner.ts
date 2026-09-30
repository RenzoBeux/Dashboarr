import { useState } from "react";
import { toast, toastError } from "@/components/ui/toast";
import {
  emptyTestRunnerState,
  finishTest,
  startTest,
  testKey,
  type TestRunnerState,
} from "@/lib/indexer-test-runner";

interface TestRow {
  id: string | number;
  name: string;
}

interface TestVerdict {
  ok: boolean;
  error?: string;
}

// Drives the per-row Test button of an indexer list: one independent run per
// row, with pending state and the verdict scoped to the instance the row was
// tested on (see lib/indexer-test-runner.ts for why both matter). `run` must
// be the mutation's `mutateAsync`, never `mutate`: a `mutate` call started
// while another is in flight replaces the observer, and the earlier row's
// callbacks never fire.
export function useIndexerTestRunner<
  TRow extends TestRow,
  TResult extends TestVerdict,
>({
  instanceId,
  run,
  failed,
}: {
  instanceId: string | null | undefined;
  run: (row: TRow) => Promise<TResult>;
  // The verdict to record when the probe itself could not run (transport
  // error, auth, unreachable), as opposed to a probe that ran and failed.
  failed: (message: string) => TResult;
}) {
  const [state, setState] = useState<TestRunnerState<TResult>>(() =>
    emptyTestRunnerState<TResult>(),
  );

  const runTest = async (row: TRow) => {
    // Taken now, before any await: a completion that lands after an instance
    // switch belongs to the server that produced it.
    const key = testKey(instanceId, row.id);
    if (state.pending.has(key)) return;
    setState((s) => startTest(s, key));

    let result: TResult;
    try {
      result = await run(row);
      if (result.ok) toast(`${row.name} is working`);
      else toast(`${row.name}: ${result.error ?? "Test failed"}`, "error");
    } catch (err) {
      result = failed(err instanceof Error ? err.message : "Test failed");
      toastError(`Couldn't test ${row.name}`, err);
    }
    setState((s) => finishTest(s, key, result));
  };

  return {
    runTest,
    isTesting: (row: TRow) => state.pending.has(testKey(instanceId, row.id)),
    resultFor: (row: TRow): TResult | undefined =>
      state.results[testKey(instanceId, row.id)],
  };
}
