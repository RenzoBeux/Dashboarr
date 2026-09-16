// Icon name of the auto-created Default dashboard. Lives apart from
// lib/dashboard-icons.ts (which imports lucide-react-native) so the config
// migrations stay free of React Native imports; dashboard-icons re-exports it
// with a `satisfies` check against the real icon registry.
export const DEFAULT_DASHBOARD_ICON = "LayoutDashboard" as const;
