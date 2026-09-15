import { ShieldOff } from "lucide-react-native";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { DurationPrompt } from "@/components/adguard/duration-prompt";
import { toast, toastError } from "@/components/ui/toast";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { useSetAdguardProtection } from "@/hooks/use-adguard";
import {
  ADGUARD_DISABLE_PRESETS,
  formatClockTime,
  formatCountdown,
  msUntilLocalMidnight,
} from "@/lib/adguard-format";

export interface AdguardDisableFlow {
  /** Open the duration picker. Safe to call from anywhere. */
  openDurationSheet: () => void;
  /** Re-enable protection immediately, with no confirmation. */
  enableNow: () => void;
  isPending: boolean;
  /** Render this somewhere in the consumer's tree. */
  modals: React.ReactNode;
}

/**
 * The "disable protection for..." interaction, shared by the AdGuard Home
 * screen's protection card and the dashboard widget so the sequencing lives
 * in one place. Mirrors hooks/use-pihole-disable-flow.tsx, unit differences
 * aside (AGH's duration is MILLISECONDS, not seconds).
 *
 * Seven options means ActionSheet, not ConfirmModal (which is two-button
 * only). Two of those options chain into a SECOND modal, which is exactly the
 * useModalFlow trigger condition — on iOS, presenting a modal while another is
 * mid-dismiss hangs the JS thread (issue #83). Calling flow.open() from inside
 * a sheet action's onPress is the sanctioned way: ActionSheet closes itself
 * first, and the flow holds the next step until onClosed fires.
 */
export function useAdguardDisableFlow(instanceId?: string): AdguardDisableFlow {
  const flow = useModalFlow<{
    duration: void;
    customDuration: void;
    confirmIndefinite: void;
  }>();
  const setProtection = useSetAdguardProtection(instanceId);

  const disable = (durationMs: number) =>
    setProtection.mutate(
      { enabled: false, duration: durationMs },
      {
        onSuccess: () =>
          toast(
            durationMs
              ? `Protection disabled for ${formatCountdown(durationMs)}`
              : "Protection disabled",
          ),
        onError: (err) => toastError("Couldn't disable protection", err),
      },
    );

  const enableNow = () =>
    setProtection.mutate(
      { enabled: true, duration: 0 },
      {
        onSuccess: () => toast("Protection enabled"),
        onError: (err) => toastError("Couldn't enable protection", err),
      },
    );

  const untilTomorrowMs = msUntilLocalMidnight();

  const actions: ActionSheetAction[] = [
    ...ADGUARD_DISABLE_PRESETS.map((preset) => ({
      label: preset.label,
      onPress: () => disable(preset.ms),
    })),
    {
      label: "Until tomorrow",
      // Spell out the resulting wall-clock time. The duration is derived from
      // the DEVICE's calendar, so if the AdGuard Home host sits in another
      // timezone this line is what removes the ambiguity.
      subtitle: `Resumes at ${formatClockTime(
        new Date(Date.now() + untilTomorrowMs),
      )} · in ${formatCountdown(untilTomorrowMs)}`,
      onPress: () => disable(untilTomorrowMs),
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
      // the whole household without DNS protection indefinitely, so it is the
      // one that gets a confirm; the presets need none.
      onPress: () => flow.open("confirmIndefinite"),
    },
  ];

  const modals = (
    <>
      <ActionSheet
        {...flow.bind("duration")}
        title="Disable protection"
        subtitle="Protection resumes automatically when the timer ends"
        actions={actions}
      />
      <DurationPrompt
        {...flow.bind("customDuration")}
        onSubmit={(ms) => {
          flow.close();
          disable(ms);
        }}
      />
      <ConfirmModal
        {...flow.bind("confirmIndefinite")}
        title="Disable protection indefinitely"
        message="Protection stays off until you turn it back on manually. No timer will re-enable it."
        icon={ShieldOff}
        tone="danger"
        confirmLabel="Disable"
        onConfirm={() => {
          flow.close();
          disable(0);
        }}
      />
    </>
  );

  return {
    openDurationSheet: () => flow.open("duration"),
    enableNow,
    isPending: setProtection.isPending,
    modals,
  };
}
