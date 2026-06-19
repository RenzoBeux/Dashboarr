import { ArrQueueCard } from "@/components/dashboard/arr-queue-card";
import { lidarrArrQueueAdapter } from "@/lib/arr-queue-adapters/lidarr";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function LidarrQueueCard(props: WidgetComponentProps) {
  return <ArrQueueCard {...props} adapter={lidarrArrQueueAdapter} />;
}
