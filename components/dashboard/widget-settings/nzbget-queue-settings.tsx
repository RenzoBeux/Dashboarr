import {
  UsenetQueueSettings,
  USENET_QUEUE_DEFAULT_SETTINGS,
  type UsenetQueueSettingsValue,
} from "@/components/dashboard/widget-settings/usenet-queue-settings";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";

export const NZBGET_QUEUE_DEFAULT_SETTINGS: UsenetQueueSettingsValue =
  USENET_QUEUE_DEFAULT_SETTINGS;
export type NzbgetQueueSettingsValue = UsenetQueueSettingsValue;

export function NzbgetQueueSettings(props: WidgetSettingsComponentProps) {
  return <UsenetQueueSettings {...props} serviceId="nzbget" />;
}
