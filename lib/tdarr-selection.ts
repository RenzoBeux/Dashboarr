import type { TdarrRowAction } from "@/lib/tdarr-tables";

export function bulkConfirmMessage(
  action: TdarrRowAction,
  count: number | null,
  tableLabel: string,
): string {
  if (count === null) return `${action.label} every file in "${tableLabel}"?`;
  return `${action.label} all ${count} file${count === 1 ? "" : "s"} in "${tableLabel}"?`;
}
