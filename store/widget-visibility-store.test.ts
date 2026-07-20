import { useWidgetVisibilityStore } from "./widget-visibility-store";

describe("widget-visibility-store", () => {
  beforeEach(() => {
    useWidgetVisibilityStore.setState({ hiddenSlots: {} });
  });

  it("marks and unmarks a slot as hidden", () => {
    const { setSlotHidden } = useWidgetVisibilityStore.getState();

    setSlotHidden("slot-1", true);
    expect(useWidgetVisibilityStore.getState().hiddenSlots).toEqual({
      "slot-1": true,
    });

    setSlotHidden("slot-1", false);
    expect(useWidgetVisibilityStore.getState().hiddenSlots).toEqual({});
  });

  it("tracks multiple slots independently", () => {
    const { setSlotHidden } = useWidgetVisibilityStore.getState();

    setSlotHidden("slot-1", true);
    setSlotHidden("slot-2", true);
    setSlotHidden("slot-1", false);

    expect(useWidgetVisibilityStore.getState().hiddenSlots).toEqual({
      "slot-2": true,
    });
  });

  it("does not produce a new hiddenSlots reference for a same-value report", () => {
    const { setSlotHidden } = useWidgetVisibilityStore.getState();

    // The common case during progressive reveal: widgets with the toggle off
    // (or with content) report `false` on mount. Must not churn the store.
    const before = useWidgetVisibilityStore.getState().hiddenSlots;
    setSlotHidden("slot-1", false);
    expect(useWidgetVisibilityStore.getState().hiddenSlots).toBe(before);

    setSlotHidden("slot-1", true);
    const hidden = useWidgetVisibilityStore.getState().hiddenSlots;
    setSlotHidden("slot-1", true);
    expect(useWidgetVisibilityStore.getState().hiddenSlots).toBe(hidden);
  });
});
