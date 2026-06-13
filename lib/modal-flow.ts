// The modal-chain flow core — the one place that knows how to sequence
// modals on iOS without hanging the app.
//
// On iOS (Fabric/New Architecture), presenting a second <Modal>, popping the
// screen, or pushing a route while another modal is still running its dismiss
// animation hangs the JS thread: a transparent layer keeps eating touches and
// the user must force-quit (issue #83). The only safe moment to continue is
// after the closing modal reports it is *fully* gone — the `onClosed` prop of
// ConfirmModal / ActionSheet, backed by hooks/use-modal-closed.ts.
//
// This machine owns that sequencing for a whole screen. Each modal in a chain
// is a named *step*; at most one step is presented at a time. On iOS,
// transitions (`open` while something is showing) and continuations
// (`whenClear`) are queued and released from `handleClosed`. Android has no
// view-controller constraint — plain dialogs present and dismiss freely — so
// with `defer` false everything runs immediately, matching the pre-flow
// behavior there. Screens declare the chain and never touch the dismiss-race
// machinery — see hooks/use-modal-flow.ts for the React adapter and the
// wiring rules.
//
// Framework-free on purpose: the race logic is testable in plain jest
// (lib/modal-flow.test.ts) without rendering a native modal.

// Rescue delay for queued work when `onClosed` never arrives. That happens
// when the closing modal unmounts mid-dismiss (e.g. a refetch error makes the
// screen early-return without its modals): use-modal-closed.ts clears its
// fallback timer on unmount, so the dismissal is never reported. Without this
// rescue, `closing` would stick forever — a queued router.back() would be
// dropped (stranding the user on a dead detail screen) and every later
// `open()` would queue silently, deadening all modals until remount.
//
// The bound: a live onClosed arrives at worst ~850ms after close —
// ActionSheet/ReleaseDetailSheet key use-modal-closed on an internal
// `mounted` flag that flips ~220ms after `visible` (their JS close
// animation; ≤350ms via ActionSheet's force-unmount backstop if the
// animation was cancelled), plus the 500ms onDismiss-fallback timer.
// 1000ms sits past that, so the backstop can never fire while a live modal
// is still dismissing (the native modal itself is gone within ~300ms; the
// rest is JS-side detection lag). If you slow a sheet's close animation or
// raise use-modal-closed's fallbackMs, re-derive this number.
const CONTINUATION_BACKSTOP_MS = 1000;

export interface ModalFlowCore {
  /** The currently presented step, or null while closed/closing. */
  step(): string | null;
  /**
   * Last payload passed to `open` for a step. Sticky across close so modal
   * content (titles, subtitles) stays correct during the dismiss animation.
   */
  payload(step: string): unknown;
  /**
   * Present a step. If another step is showing or mid-dismiss, it is closed
   * first and (on iOS) this one opens only once the dismissal has fully
   * completed. Calling `open` from inside a sheet action's onPress is the
   * supported way to chain modals — the stash-and-promote happens here.
   */
  open(step: string, payload?: unknown): void;
  /** Start closing the presented step (cancel/confirm paths both end here). */
  close(): void;
  /**
   * Run a continuation (navigation, OS picker, …) once no flow modal is on
   * screen. Closes the presented step if there is one. With `defer` false
   * (Android) the continuation runs immediately; with `defer` true (iOS) it
   * waits for `handleClosed`, with the backstop as a safety net. A later
   * `whenClear` replaces a queued one; a queued continuation also supersedes
   * a pending `open`.
   */
  whenClear(run: () => void): void;
  /**
   * Wire to every flow modal's `onClosed`. Releases whatever is queued:
   * a pending `open` is presented, a pending continuation runs.
   */
  handleClosed(): void;
  /** Cancel timers and queued work (call on unmount). */
  dispose(): void;
}

export function createModalFlow(opts: {
  /** Defer queued work until the closing modal is fully gone (iOS). */
  defer: boolean;
  /** Notified whenever the presented step changes. */
  onState: (step: string | null) => void;
  backstopMs?: number;
}): ModalFlowCore {
  const backstopMs = opts.backstopMs ?? CONTINUATION_BACKSTOP_MS;
  let current: string | null = null;
  // True between a step's `visible` flipping false and its onClosed firing —
  // the exact window where presenting or navigating hangs iOS. Never set on
  // Android (defer false): nothing queues there, so nothing can wedge.
  let closing = false;
  let pendingOpen: { step: string; payload: unknown } | null = null;
  let pendingRun: (() => void) | null = null;
  let backstop: ReturnType<typeof setTimeout> | null = null;
  const payloads = new Map<string, unknown>();

  const clearBackstop = () => {
    if (backstop) {
      clearTimeout(backstop);
      backstop = null;
    }
  };

  const present = (step: string, payload: unknown) => {
    payloads.set(step, payload);
    current = step;
    opts.onState(current);
  };

  // Every close arms the backstop, so `closing` can outlive a lost onClosed
  // by at most backstopMs — queued opens and continuations both get rescued,
  // and the machine can never stay wedged.
  const close = () => {
    if (current === null) return;
    current = null;
    if (opts.defer) {
      closing = true;
      clearBackstop();
      backstop = setTimeout(handleClosed, backstopMs);
    }
    opts.onState(null);
  };

  // A continuation leaves the screen, so it wins over a queued open.
  const releaseQueued = () => {
    if (pendingRun) {
      const run = pendingRun;
      pendingRun = null;
      pendingOpen = null;
      run();
    } else if (pendingOpen) {
      const next = pendingOpen;
      pendingOpen = null;
      present(next.step, next.payload);
    }
  };

  const handleClosed = () => {
    closing = false;
    clearBackstop();
    releaseQueued();
  };

  return {
    step: () => current,
    payload: (step) => payloads.get(step),
    open(step, payload) {
      if (current !== null) {
        if (opts.defer) {
          pendingOpen = { step, payload };
          close();
          return;
        }
        // Android: dialogs stack/replace freely — present right away.
        close();
        present(step, payload);
        return;
      }
      if (closing) {
        pendingOpen = { step, payload };
        return;
      }
      present(step, payload);
    },
    close,
    whenClear(run) {
      if (current !== null) close();
      if (!closing) {
        run();
        return;
      }
      // The backstop armed by close() covers this queue slot too.
      pendingRun = run;
    },
    handleClosed,
    dispose() {
      clearBackstop();
      closing = false;
      pendingRun = null;
      pendingOpen = null;
    },
  };
}
