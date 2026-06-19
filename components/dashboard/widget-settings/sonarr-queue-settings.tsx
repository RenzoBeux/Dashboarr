import {
  ArrQueueSettings,
  ARR_QUEUE_DEFAULT_SETTINGS,
  type ArrQueueSettingsValue,
} from "@/components/dashboard/widget-settings/arr-queue-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";

export const SONARR_QUEUE_DEFAULT_SETTINGS: ArrQueueSettingsValue =
  ARR_QUEUE_DEFAULT_SETTINGS;
export type SonarrQueueSettingsValue = ArrQueueSettingsValue;

export function SonarrQueueSettings(props: WidgetSettingsComponentProps) {
  return <ArrQueueSettings {...props} serviceId="sonarr" />;
}
