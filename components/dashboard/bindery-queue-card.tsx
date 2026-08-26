import { ArrQueueCard } from "@/components/dashboard/arr-queue-card";
import { binderyArrQueueAdapter } from "@/lib/arr-queue-adapters/bindery";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

export function BinderyQueueCard(props: WidgetComponentProps) {
  return <ArrQueueCard {...props} adapter={binderyArrQueueAdapter} />;
}
