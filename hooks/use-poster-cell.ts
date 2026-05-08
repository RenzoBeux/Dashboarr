import { useWindowDimensions } from "react-native";
import { useUiScale } from "@/hooks/use-ui-scale";

// Match ScreenWrapper's px-4 (1rem each side) and the grids' gap-3 (0.75rem).
const SCREEN_PADDING_REM = 1;
const CELL_GAP_REM = 0.75;
const REM_BASE = 14;

/**
 * Cell width (in dp) for a poster grid that's 3-up at default scale and
 * drops to 2-up at any larger accessibility scale.
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
export function usePosterCellWidth(): number {
  const { width: screenWidth } = useWindowDimensions();
  const scale = useUiScale();
  const padding = SCREEN_PADDING_REM * REM_BASE * scale;
  const gap = CELL_GAP_REM * REM_BASE * scale;
  // 3 cols at Normal, 2 cols at Large+ so posters get noticeably bigger.
  const cols = scale >= 1.15 ? 2 : 3;
  const contentWidth = screenWidth - 2 * padding;
  // Floor avoids sub-pixel rounding pushing the row over container width.
  return Math.floor((contentWidth - (cols - 1) * gap) / cols);
}
