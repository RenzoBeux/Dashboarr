import { ArrQueueCard } from "@/components/dashboard/arr-queue-card";
import { radarrArrQueueAdapter } from "@/lib/arr-queue-adapters/radarr";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function RadarrQueueCard(props: WidgetComponentProps) {
  return <ArrQueueCard {...props} adapter={radarrArrQueueAdapter} />;
}
