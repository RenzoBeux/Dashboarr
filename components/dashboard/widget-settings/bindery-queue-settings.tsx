import {
  ArrQueueSettings,
  ARR_QUEUE_DEFAULT_SETTINGS,
  type ArrQueueSettingsValue,
} from "@/components/dashboard/widget-settings/arr-queue-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";

export const BINDERY_QUEUE_DEFAULT_SETTINGS: ArrQueueSettingsValue =
  ARR_QUEUE_DEFAULT_SETTINGS;
export type BinderyQueueSettingsValue = ArrQueueSettingsValue;

export function BinderyQueueSettings(props: WidgetSettingsComponentProps) {
  return <ArrQueueSettings {...props} serviceId="bindery" />;
}
