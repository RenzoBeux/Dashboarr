import type { TdarrRowAction } from "@/lib/tdarr-tables";

export function toggleSelected(sel: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// After a refetch (e.g. a single-row action moved a file out of the table),
// keep only the ids still visible so the bulk bar's count stays honest.
export function pruneSelection(
  sel: ReadonlySet<string>,
  visibleIds: Iterable<string>,
): Set<string> {
  const visible = new Set(visibleIds);
  return new Set([...sel].filter((id) => visible.has(id)));
}

export function bulkConfirmMessage(
  action: TdarrRowAction,
  count: number | null,
  tableLabel: string,
): string {
  if (count === null) return `${action.label} every file in "${tableLabel}"?`;
  return `${action.label} all ${count} file${count === 1 ? "" : "s"} in "${tableLabel}"?`;
}
