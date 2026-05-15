import { UsenetQueueCard } from "@/components/dashboard/usenet-queue-card";
import { nzbgetAdapter } from "@/lib/usenet-adapters/nzbget";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function NzbgetQueueCard(props: WidgetComponentProps) {
  return <UsenetQueueCard {...props} adapter={nzbgetAdapter} />;
}
