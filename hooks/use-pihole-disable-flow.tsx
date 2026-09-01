import { ShieldOff } from "lucide-react-native";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { DurationPrompt } from "@/components/pihole/duration-prompt";
import { toast, toastError } from "@/components/ui/toast";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { useSetPiholeBlocking } from "@/hooks/use-pihole";
import {
  PIHOLE_DISABLE_PRESETS,
  formatClockTime,
  formatCountdown,
  secondsUntilLocalMidnight,
} from "@/lib/pihole-format";
import { piholeErrorMessage } from "@/lib/pihole-normalize";

export interface PiholeDisableFlow {
  /** Open the duration picker. Safe to call from anywhere. */
  openDurationSheet: () => void;
  /** Re-enable blocking immediately, with no confirmation. */
  enableNow: () => void;
  isPending: boolean;
  /** Render this somewhere in the consumer's tree. */
  modals: React.ReactNode;
}

/**
 * The "disable blocking for..." interaction, shared by the Pi-hole screen's
 * blocking card and the dashboard widget so the sequencing lives in one place.
 *
 * Seven options means ActionSheet, not ConfirmModal (which is two-button only).
 * Two of those options chain into a SECOND modal, which is exactly the
 * useModalFlow trigger condition — on iOS, presenting a modal while another is
 * mid-dismiss hangs the JS thread (issue #83). Calling flow.open() from inside
 * a sheet action's onPress is the sanctioned way: ActionSheet closes itself
 * first, and the flow holds the next step until onClosed fires.
 */
export function usePiholeDisableFlow(instanceId?: string): PiholeDisableFlow {
  const flow = useModalFlow<{
    duration: void;
    customDuration: void;
    confirmIndefinite: void;
  }>();
  const setBlocking = useSetPiholeBlocking(instanceId);

  const disable = (timer: number | null) =>
    setBlocking.mutate(
      { blocking: false, timer },
      {
        onSuccess: () =>
          toast(
            timer
              ? `Blocking disabled for ${formatCountdown(timer)}`
              : "Blocking disabled",
          ),
        onError: (err) =>
          toastError("Couldn't disable blocking", err, piholeErrorMessage),
      },
    );

  const enableNow = () =>
    setBlocking.mutate(
      { blocking: true, timer: null },
      {
        onSuccess: () => toast("Blocking enabled"),
        onError: (err) =>
          toastError("Couldn't enable blocking", err, piholeErrorMessage),
      },
    );

  const untilTomorrow = secondsUntilLocalMidnight();

  const actions: ActionSheetAction[] = [
    ...PIHOLE_DISABLE_PRESETS.map((preset) => ({
      label: preset.label,
      onPress: () => disable(preset.seconds),
    })),
    {
      label: "Until tomorrow",
      // Spell out the resulting wall-clock time. The duration is derived from
      // the DEVICE's calendar, so if the Pi-hole sits in another timezone this
      // line is what removes the ambiguity.
      subtitle: `Resumes at ${formatClockTime(
        new Date(Date.now() + untilTomorrow * 1000),
      )} · in ${formatCountdown(untilTomorrow)}`,
      onPress: () => disable(untilTomorrow),
    },
    {
      label: "Custom…",
      onPress: () => flow.open("customDuration"),
    },
    {
      label: "Disable indefinitely",
      subtitle: "No timer — stays off until you turn it back on",
      variant: "danger",
      // The only option that never expires on its own. A mis-tap here leaves
      // the whole household without ad blocking indefinitely, so it is the one
      // that gets a confirm; the presets need none.
      onPress: () => flow.open("confirmIndefinite"),
    },
  ];

  const modals = (
    <>
      <ActionSheet
        {...flow.bind("duration")}
        title="Disable blocking"
        subtitle="Blocking resumes automatically when the timer ends"
        actions={actions}
      />
      <DurationPrompt
        {...flow.bind("customDuration")}
        onSubmit={(seconds) => {
          flow.close();
          disable(seconds);
        }}
      />
      <ConfirmModal
        {...flow.bind("confirmIndefinite")}
        title="Disable blocking indefinitely"
        message="Blocking stays off until you turn it back on manually. No timer will re-enable it."
        icon={ShieldOff}
        tone="danger"
        confirmLabel="Disable"
        onConfirm={() => {
          flow.close();
          disable(null);
        }}
      />
    </>
  );

  return {
    openDurationSheet: () => flow.open("duration"),
    enableNow,
    isPending: setBlocking.isPending,
    modals,
  };
}
