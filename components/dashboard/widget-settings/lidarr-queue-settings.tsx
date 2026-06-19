import {
  ArrQueueSettings,
  ARR_QUEUE_DEFAULT_SETTINGS,
  type ArrQueueSettingsValue,
} from "@/components/dashboard/widget-settings/arr-queue-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";

export const LIDARR_QUEUE_DEFAULT_SETTINGS: ArrQueueSettingsValue =
  ARR_QUEUE_DEFAULT_SETTINGS;
export type LidarrQueueSettingsValue = ArrQueueSettingsValue;

export function LidarrQueueSettings(props: WidgetSettingsComponentProps) {
  return <ArrQueueSettings {...props} serviceId="lidarr" />;
}
