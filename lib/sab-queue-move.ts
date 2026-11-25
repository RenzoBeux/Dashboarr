export type SabQueueMove = "top" | "up" | "down" | "bottom";

/**
 * The index to hand SAB's mode=switch for a move, or null when the job is
 * already there (top/up at index 0, down/bottom at the last index).
 */
export function sabQueueMoveTarget(
  move: SabQueueMove,
  position: number,
  length: number,
): number | null {
  const last = length - 1;
  const target =
    move === "top" ? 0 : move === "up" ? position - 1 : move === "down" ? position + 1 : last;
  if (target < 0 || target > last || target === position) return null;
  return target;
}
