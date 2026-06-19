import { ArrQueueCard } from "@/components/dashboard/arr-queue-card";
import { sonarrArrQueueAdapter } from "@/lib/arr-queue-adapters/sonarr";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function SonarrQueueCard(props: WidgetComponentProps) {
  return <ArrQueueCard {...props} adapter={sonarrArrQueueAdapter} />;
}
