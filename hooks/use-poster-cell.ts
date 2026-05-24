import { useWindowDimensions } from "react-native";
import { useUiScale } from "@/hooks/use-ui-scale";

// Match ScreenWrapper's px-4 (1rem each side) and the grids' gap-3 (0.75rem).
const SCREEN_PADDING_REM = 1;
const CELL_GAP_REM = 0.75;
const REM_BASE = 14;

export interface PosterCellLayout {
  width: number;
  columns: number;
  gap: number;
  horizontalPadding: number;
}

/**
 * Layout for a poster grid that's 3-up at default scale and drops to 2-up at
 * any larger accessibility scale. Returns the per-cell width plus the column
 * count and gap/padding values so callers driving virtualized lists
 * (FlatList numColumns / columnWrapperStyle) can stay in sync with the
 * legacy flex-wrap renderers.
 *
 * Why numeric instead of percentage classes (`w-[30%]` etc.):
 * With `inlineRem: false`, gap-3 and px-4 scale at runtime via the rem
 * observable. RN/Yoga's flex-wrap with percentage children + scaled gaps +
 * scaled intrinsic text width is unreliable — it can collapse rows that
 * mathematically should fit. Computing the exact pixel width here sidesteps
 * every flex-wrap heuristic and lays out deterministically at every scale.
 *
 * Apply via inline `style={{ width: cellWidth }}`, NOT className.
 */
export function usePosterCellLayout(): PosterCellLayout {
  const { width: screenWidth } = useWindowDimensions();
  const scale = useUiScale();
  const horizontalPadding = SCREEN_PADDING_REM * REM_BASE * scale;
  const gap = CELL_GAP_REM * REM_BASE * scale;
  // 3 cols at Normal, 2 cols at Large+ so posters get noticeably bigger.
  const columns = scale >= 1.15 ? 2 : 3;
  const contentWidth = screenWidth - 2 * horizontalPadding;
  // Floor avoids sub-pixel rounding pushing the row over container width.
  const width = Math.floor((contentWidth - (columns - 1) * gap) / columns);
  return { width, columns, gap, horizontalPadding };
}

export function usePosterCellWidth(): number {
  return usePosterCellLayout().width;
}
