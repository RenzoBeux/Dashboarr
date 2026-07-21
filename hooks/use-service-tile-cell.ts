import { useWindowDimensions } from "react-native";
import { useUiScale } from "@/hooks/use-ui-scale";

const REM_BASE = 14;
// ScreenWrapper's px-4 (1rem) plus the Card's p-4 (1rem), each side — the
// Status widget's grid sits one level deeper than the poster grids.
const INSET_REM = 2;
// Must match the gap actually rendered on the grid container.
const GAP_REM = 1;
// The logo chrome is ICON.LG (24) + p-2.5 on both sides = 41.5 rem-scaled px;
// 4.5rem leaves room for a short instance name before truncation kicks in.
const MIN_TILE_REM = 4.5;
// The Card's own 1px border (x2) plus the 1px dashed border the dashboard puts
// around each slot in edit mode (app/(tabs)/dashboard.tsx). The widget can't
// see editMode, so subtract it always: 2px of unused gutter is invisible,
// whereas overflowing would drop a whole column the moment the user taps edit.
const FIXED_BORDERS = 4;

export interface ServiceTileLayout {
  width: number;
  columns: number;
  gap: number;
}

/**
 * Equal-width cells for the Status widget's service tile grid.
 *
 * Same rationale as usePosterCellLayout: with `inlineRem: false`, padding and
 * gaps scale at runtime, and RN/Yoga's flex-wrap with intrinsically-sized
 * children is unreliable. Here it's also correctness, not just layout taste —
 * an intrinsically-sized tile grows to fit a long instance name, which knocks
 * every following tile out of its column. A computed pixel width pins the
 * columns and lets the label's `numberOfLines={1}` actually ellipsize.
 *
 * Column count is derived (not the hardcoded 3-or-2 of usePosterCellLayout) so
 * a 320pt phone at scale 1.3 and a tablet both land on a sensible grid.
 *
 * Apply via inline `style={{ width }}` on the flex child, NOT className. The
 * inset assumes the single mount point (ScreenWrapper > Card). If a widget
 * preview or a narrower container ever renders this grid, take the inset as a
 * parameter or measure with onLayout instead.
 */
export function useServiceTileLayout(): ServiceTileLayout {
  const { width: screenWidth } = useWindowDimensions();
  const scale = useUiScale();
  const inset = INSET_REM * REM_BASE * scale;
  const gap = GAP_REM * REM_BASE * scale;
  const minTile = MIN_TILE_REM * REM_BASE * scale;
  const contentWidth = screenWidth - 2 * inset - FIXED_BORDERS;
  // At least 2 columns so a very narrow screen at max UI scale still reads as
  // a grid instead of a single stacked column.
  const columns = Math.max(
    2,
    Math.floor((contentWidth + gap) / (minTile + gap)),
  );
  // Floor avoids sub-pixel rounding pushing the row over container width.
  const width = Math.floor((contentWidth - (columns - 1) * gap) / columns);
  return { width, columns, gap };
}
