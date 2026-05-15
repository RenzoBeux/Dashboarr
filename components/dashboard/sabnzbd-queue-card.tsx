import { UsenetQueueCard } from "@/components/dashboard/usenet-queue-card";
import { sabnzbdAdapter } from "@/lib/usenet-adapters/sabnzbd";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function SabnzbdQueueCard(props: WidgetComponentProps) {
  return <UsenetQueueCard {...props} adapter={sabnzbdAdapter} />;
}
