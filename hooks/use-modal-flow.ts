import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { createModalFlow, type ModalFlowCore } from "@/lib/modal-flow";

/**
 * useModalFlow — declare a screen's modal chain; never hand-wire the
 * iOS dismiss race again.
 *
 * Every modal that chains into another modal or into navigation is a named
 * *step* with an optional typed payload. The flow owns visibility, the
 * payload handoff between steps, and deferred navigation; the sequencing
 * rules (issue #83 — never present/pop while a modal is mid-dismiss) live in
 * lib/modal-flow.ts.
 *
 *   type DeleteMode = "keep" | "withFiles";
 *   const flow = useModalFlow<{
 *     actions: void;                // no payload
 *     confirmDelete: DeleteMode;    // payload carried sheet → confirm
 *   }>();
 *
 *   <ActionSheet
 *     {...flow.bind("actions")}
 *     actions={[{ label: "Delete", variant: "danger",
 *       // Chaining from inside an action: just open the next step. The sheet
 *       // is already dismissing (ActionSheet closes itself before onPress);
 *       // the flow presents the confirm only once it is fully gone.
 *       onPress: () => flow.open("confirmDelete", "keep") }]}
 *   />
 *   <ConfirmModal
 *     {...flow.bind("confirmDelete")}
 *     title={flow.payload("confirmDelete") === "withFiles" ? … : …}
 *     onConfirm={() => {
 *       flow.close();
 *       deleteMutation.mutate(vars, { onSuccess: () => flow.back() });
 *     }}
 *   />
 *
 * Rules:
 * - Only onClosed-capable modals (ConfirmModal, ActionSheet,
 *   ReleaseDetailSheet, PassphrasePrompt, AddToDashboardsSheet — anything
 *   wiring useModalClosed to an onClosed prop) can be flow steps — the flow
 *   relies on `onClosed` to know when the modal is fully gone. Sheets without
 *   that plumbing (raw pageSheet Modals, custom pickers) keep plain useState
 *   and must never chain into another modal or navigation.
 * - Open and close steps only through the flow (`open`/`close`/`bind`),
 *   never with your own setState — a bypassed close leaves the flow blind to
 *   the dismissal.
 * - Navigation (or any present-like continuation: OS pickers, share sheets)
 *   that follows a step goes through `back()` / `whenClear()` — from a
 *   mutation's onSuccess for confirm-then-pop, or fire-and-forget right after
 *   the mutate call for optimistic pops.
 * - For a component whose visibility is its payload prop (ReleaseDetailSheet's
 *   `release`), gate it: `release={flow.isOpen("detail") ? flow.payload("detail")! : null}`
 *   — `payload()` is sticky after close on purpose, so content stays correct
 *   during the dismiss animation.
 */

type StepKey<M> = Extract<keyof M, string>;
type OpenArgs<M, K extends StepKey<M>> = M[K] extends void
  ? []
  : [payload: M[K]];

export interface ModalFlowBind {
  visible: boolean;
  /** For ActionSheet / custom sheets. */
  onClose: () => void;
  /** For ConfirmModal. */
  onCancel: () => void;
  /** Releases the queued next step / continuation once fully dismissed. */
  onClosed: () => void;
}

export function useModalFlow<M extends Record<string, unknown>>() {
  const router = useRouter();
  const [, force] = useState(0);
  const coreRef = useRef<ModalFlowCore | null>(null);
  if (!coreRef.current) {
    coreRef.current = createModalFlow({
      defer: Platform.OS === "ios",
      onState: () => force((t) => t + 1),
    });
  }
  const core = coreRef.current;

  // Drop any queued continuation with the screen — a backstop firing after
  // unmount must not pop a screen the user already left.
  useEffect(() => () => core.dispose(), [core]);

  // Stable identity: everything delegates to the ref-stable core, so the flow
  // object can live in memo/callback deps without defeating them. State reads
  // (isOpen/payload/bind) are function calls, fresh on every render via the
  // onState-driven re-render above.
  return useMemo(
    () => ({
      /** Present a step; chains safely from inside another step's handlers. */
      open: <K extends StepKey<M>>(step: K, ...args: OpenArgs<M, K>) =>
        core.open(step, args[0]),
      /** Start closing the presented step. */
      close: core.close,
      isOpen: (step: StepKey<M>) => core.step() === step,
      /** Last payload for a step — sticky through the dismiss animation. */
      payload: <K extends StepKey<M>>(step: K) =>
        core.payload(step) as M[K] | undefined,
      /** Run navigation/continuation once no flow modal is on screen. */
      whenClear: core.whenClear,
      /** whenClear(router.back) — pop after the modal is fully dismissed. */
      back: () => core.whenClear(() => router.back()),
      /**
       * For modals wired without `bind` (e.g. payload-as-visibility components
       * like ReleaseDetailSheet): attach to the modal's onClosed prop.
       */
      onClosed: core.handleClosed,
      /** Spread onto the step's modal; each component takes the props it knows. */
      bind: (step: StepKey<M>): ModalFlowBind => ({
        visible: core.step() === step,
        onClose: core.close,
        onCancel: core.close,
        onClosed: core.handleClosed,
      }),
    }),
    [core, router],
  );
}
