// Accent palette for dashboard identity. Hex strings so they round-trip
// through JSON export/import unchanged. The first entry is the default that
// existing dashboards adopt at migration time — keep "Blue" at index 0.
export const DASHBOARD_COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Red", value: "#ef4444" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Slate", value: "#64748b" },
] as const;

export const DEFAULT_DASHBOARD_COLOR = DASHBOARD_COLORS[0].value;

const VALID_COLORS = new Set<string>(DASHBOARD_COLORS.map((c) => c.value));

export function resolveDashboardColor(value: string | undefined): string {
  if (value && VALID_COLORS.has(value)) return value;
  return DEFAULT_DASHBOARD_COLOR;
}

export function isValidDashboardColor(value: unknown): value is string {
  return typeof value === "string" && VALID_COLORS.has(value);
}
