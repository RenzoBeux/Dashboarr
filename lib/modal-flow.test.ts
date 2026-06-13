import { createModalFlow } from "./modal-flow";

// The modal-flow core is the one place that sequences modals around the iOS
// dismiss race (issue #83): never present a second modal or navigate while
// another modal is mid-dismiss; release queued work only from onClosed (with
// a backstop so an unmounted modal can't strand a queued navigation). These
// tests drive the machine exactly the way ConfirmModal/ActionSheet do —
// `close()` when `visible` flips false, `handleClosed()` when the native
// modal reports fully gone.

function make(over: { defer?: boolean; backstopMs?: number } = {}) {
  const states: (string | null)[] = [];
  const flow = createModalFlow({
    defer: over.defer ?? true,
    backstopMs: over.backstopMs,
    onState: (s) => states.push(s),
  });
  return { flow, states };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("presenting", () => {
  it("opens immediately when nothing is on screen", () => {
    const { flow, states } = make();
    flow.open("actions");
    expect(flow.step()).toBe("actions");
    expect(states).toEqual(["actions"]);
  });

  it("close() hides the step and reports null", () => {
    const { flow, states } = make();
    flow.open("actions");
    flow.close();
    expect(flow.step()).toBeNull();
    expect(states).toEqual(["actions", null]);
  });

  it("cancel chain: close + onClosed with nothing queued presents nothing", () => {
    const { flow, states } = make();
    flow.open("actions");
    flow.close();
    flow.handleClosed();
    expect(flow.step()).toBeNull();
    expect(states).toEqual(["actions", null]);
  });
});

describe("Android (defer=false) — no view-controller constraint, nothing queues", () => {
  it("chained open presents immediately", () => {
    const { flow } = make({ defer: false });
    flow.open("actions");
    flow.close();
    flow.open("confirmDelete", "keep");
    expect(flow.step()).toBe("confirmDelete");
  });

  it("open over a visible step swaps immediately", () => {
    const { flow } = make({ defer: false });
    flow.open("a");
    flow.open("b");
    expect(flow.step()).toBe("b");
  });

  it("a late onClosed afterwards is a harmless no-op", () => {
    const { flow } = make({ defer: false });
    flow.open("actions");
    flow.close();
    flow.open("confirmDelete", "keep");
    flow.handleClosed(); // the first sheet's onClosed timer lands later
    expect(flow.step()).toBe("confirmDelete");
  });
});

describe("chaining (sheet → next modal)", () => {
  // The ActionSheet shape: handleAction calls onClose() first, then the
  // action's onPress — so open() for the next step always lands mid-dismiss.
  it("open while closing waits for onClosed (issue #83)", () => {
    const { flow, states } = make();
    flow.open("actions");
    flow.close(); // sheet starts dismissing
    flow.open("confirmDelete", "withFiles"); // from the action's onPress
    // Not presented yet — the sheet is still tearing down.
    expect(flow.step()).toBeNull();
    flow.handleClosed();
    expect(flow.step()).toBe("confirmDelete");
    expect(flow.payload("confirmDelete")).toBe("withFiles");
    expect(states).toEqual(["actions", null, "confirmDelete"]);
  });

  it("open while another step is fully open closes it first, then promotes", () => {
    const { flow } = make();
    flow.open("a");
    flow.open("b");
    expect(flow.step()).toBeNull(); // a is dismissing
    flow.handleClosed();
    expect(flow.step()).toBe("b");
  });

  it("a second open while closing replaces the queued one", () => {
    const { flow } = make();
    flow.open("actions");
    flow.close();
    flow.open("confirmDelete", "keep");
    flow.open("confirmDelete", "withFiles");
    flow.handleClosed();
    expect(flow.payload("confirmDelete")).toBe("withFiles");
  });

  it("payload is sticky after close so dismissing modals keep their copy", () => {
    const { flow } = make();
    flow.open("confirmDelete", "withFiles");
    flow.close();
    expect(flow.payload("confirmDelete")).toBe("withFiles");
  });
});

describe("whenClear (navigation / continuations)", () => {
  it("runs immediately when nothing is on screen", () => {
    const { flow } = make();
    const run = jest.fn();
    flow.whenClear(run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  // The confirm-then-pop shape: confirm handler closes the modal and fires
  // the mutation; onSuccess calls back() while the modal may still be
  // dismissing. The fast-LAN race from issue #83.
  it("defers while a modal is mid-dismiss, runs on onClosed", () => {
    const { flow } = make();
    const run = jest.fn();
    flow.open("confirmDelete", "keep");
    flow.close();
    flow.whenClear(run); // mutation resolved before the dismiss finished
    expect(run).not.toHaveBeenCalled();
    flow.handleClosed();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("closes an open step itself, then defers", () => {
    const { flow } = make();
    const run = jest.fn();
    flow.open("actions");
    flow.whenClear(run);
    expect(flow.step()).toBeNull();
    expect(run).not.toHaveBeenCalled();
    flow.handleClosed();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs immediately on Android (defer=false) even mid-dismiss", () => {
    const { flow } = make({ defer: false });
    const run = jest.fn();
    flow.open("delete");
    flow.close();
    flow.whenClear(run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("an open arriving after a queued continuation is dropped (deliberate asymmetry)", () => {
    const { flow } = make();
    const run = jest.fn();
    flow.open("actions");
    flow.close();
    flow.whenClear(run); // navigation decided first — it leaves the screen
    flow.open("confirmDelete", "keep"); // late open loses
    flow.handleClosed();
    expect(run).toHaveBeenCalledTimes(1);
    expect(flow.step()).toBeNull();
  });

  it("a queued continuation supersedes a queued open", () => {
    const { flow } = make();
    const run = jest.fn();
    flow.open("actions");
    flow.close();
    flow.open("confirmDelete", "keep");
    flow.whenClear(run); // e.g. optimistic pop decided after the chain started
    flow.handleClosed();
    expect(run).toHaveBeenCalledTimes(1);
    expect(flow.step()).toBeNull(); // the queued open was dropped
  });

  it("a later whenClear replaces the queued one", () => {
    const { flow } = make();
    const first = jest.fn();
    const second = jest.fn();
    flow.open("delete");
    flow.close();
    flow.whenClear(first);
    flow.whenClear(second);
    flow.handleClosed();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("backstop (modal unmounted before delivering onClosed)", () => {
  // The stranding race: a refetch removes the item, the screen early-returns
  // without the sheet, use-modal-closed clears its timer on unmount, and
  // onClosed never fires. The queued router.back() must still run.
  it("runs the queued continuation after backstopMs if onClosed never fires", () => {
    const { flow } = make({ backstopMs: 700 });
    const run = jest.fn();
    flow.open("delete");
    flow.close();
    flow.whenClear(run);
    jest.advanceTimersByTime(699);
    expect(run).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("onClosed cancels the backstop — the continuation runs exactly once", () => {
    const { flow } = make({ backstopMs: 700 });
    const run = jest.fn();
    flow.open("delete");
    flow.close();
    flow.whenClear(run);
    flow.handleClosed();
    jest.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a late onClosed after the backstop fired does not run it twice", () => {
    const { flow } = make({ backstopMs: 700 });
    const run = jest.fn();
    flow.open("delete");
    flow.close();
    flow.whenClear(run);
    jest.advanceTimersByTime(700);
    flow.handleClosed();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("releases a queued open when onClosed never arrives", () => {
    const { flow } = make({ backstopMs: 700 });
    flow.open("actions");
    flow.close();
    flow.open("confirmDelete", "keep"); // queued behind the lost dismissal
    jest.advanceTimersByTime(700);
    expect(flow.step()).toBe("confirmDelete");
  });

  it("resets closing after firing — the machine never wedges", () => {
    const { flow } = make({ backstopMs: 700 });
    flow.open("actions");
    flow.close(); // onClosed lost (modal unmounted), nothing queued
    jest.advanceTimersByTime(700);
    flow.open("confirmDelete", "keep");
    expect(flow.step()).toBe("confirmDelete"); // presents immediately
  });

  it("double handleClosed delivery is idempotent", () => {
    const { flow } = make();
    const run = jest.fn();
    flow.open("delete");
    flow.close();
    flow.whenClear(run);
    flow.handleClosed();
    flow.handleClosed();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("dispose drops the queued continuation (no ghost navigation after unmount)", () => {
    const { flow } = make({ backstopMs: 700 });
    const run = jest.fn();
    flow.open("delete");
    flow.close();
    flow.whenClear(run);
    flow.dispose();
    jest.advanceTimersByTime(2000);
    flow.handleClosed();
    expect(run).not.toHaveBeenCalled();
  });
});
