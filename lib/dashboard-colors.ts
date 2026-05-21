// Accent palette for dashboard identity. Hex strings so they round-trip
// through JSON export/import unchanged. The first entry is the default that
// existing dashboards adopt at migration time — keep "Blue" at index 0.
// `hex` (not `value`) on purpose: the reanimated babel plugin emits a noisy
// dev-only warning for any `style={{ k: x.value }}` pattern because it cannot
// distinguish a real shared value from any property literally named `value`.
// Renaming sidesteps the false positive that fires once per rendered swatch.
export const DASHBOARD_COLORS = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Red", hex: "#ef4444" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Green", hex: "#22c55e" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Slate", hex: "#64748b" },
] as const;

export const DEFAULT_DASHBOARD_COLOR = DASHBOARD_COLORS[0].hex;

const VALID_COLORS = new Set<string>(DASHBOARD_COLORS.map((c) => c.hex));

export function resolveDashboardColor(value: string | undefined): string {
  if (value && VALID_COLORS.has(value)) return value;
  return DEFAULT_DASHBOARD_COLOR;
}

export function isValidDashboardColor(value: unknown): value is string {
  return typeof value === "string" && VALID_COLORS.has(value);
}
