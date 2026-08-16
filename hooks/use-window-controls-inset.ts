import { useEffect, useState } from "react";
import { Dimensions, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { BASE_REM, useUiScale } from "@/hooks/use-ui-scale";

// iPadOS 26 draws a window-control cluster (close/minimize/expand) over the
// top-leading corner of every window, covering anything the app renders there
// (issue #342: the back arrow). The WindowControls native module reads the
// system's corner-adapted layout margins — the same signal UINavigationBar
// uses to shift its leading items — and reports how far (pt, from each window
// edge) top-of-screen content must stay clear. Everywhere the cluster can't
// overlap content (iPhone, fullscreen iPad, iOS < 26, Android) it reports 0,
// so consumers can apply the inset unconditionally.
const WindowControls =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<{
        getTopCornerInsets(): Promise<{ left: number; right: number }>;
      }>("WindowControls")
    : null;

export interface WindowControlsInset {
  left: number;
  right: number;
}

const ZERO: WindowControlsInset = { left: 0, right: 0 };

// One measurement shared by every mounted header. The cluster is fixed to the
// window's corner, so the inset only changes when the window itself changes
// (fullscreen <-> windowed, resize) — all of which fire a Dimensions change.
let current: WindowControlsInset = ZERO;
let measureStarted = false;
let dimensionsSubscribed = false;
let pendingFrame: number | null = null;
const listeners = new Set<(insets: WindowControlsInset) => void>();

async function measure() {
  if (!WindowControls) return;
  try {
    const next = await WindowControls.getTopCornerInsets();
    if (next.left === current.left && next.right === current.right) return;
    current = next;
    listeners.forEach((listener) => listener(current));
  } catch {
    // Older binary without the module recompiled — keep zeros.
  }
}

function ensureDimensionsListener() {
  if (dimensionsSubscribed) return;
  dimensionsSubscribed = true;
  Dimensions.addEventListener("change", () => {
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    // Measuring in the same frame as an un-maximize reads stale margins
    // (react-navigation hit the same race in their CornerInset view) — defer
    // one frame so the window has settled.
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      void measure();
    });
  });
}

export function useWindowControlsInset(): WindowControlsInset {
  const [insets, setInsets] = useState(current);

  useEffect(() => {
    if (!WindowControls) return;
    listeners.add(setInsets);
    ensureDimensionsListener();
    if (!measureStarted) {
      measureStarted = true;
      void measure();
    } else {
      setInsets(current);
    }
    return () => {
      listeners.delete(setInsets);
    };
  }, []);

  return insets;
}

/**
 * Horizontal padding for a header row that sits inside a screen's standard
 * 1rem content padding (ScreenWrapper px-4). The screen padding already
 * offsets the row from the window edge, so only the remainder of the
 * window-control inset is applied. Spread into the row's style.
 */
export function useWindowControlsContentPadding(): {
  paddingLeft: number;
  paddingRight: number;
} {
  const insets = useWindowControlsInset();
  const contentPad = BASE_REM * useUiScale();
  return {
    paddingLeft: Math.max(0, insets.left - contentPad),
    paddingRight: Math.max(0, insets.right - contentPad),
  };
}
