import { useEffect } from "react";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS } from "@/lib/constants";

/**
 * Hook that auto-switches between local and remote URLs based on network.
 *
 * Note: Full WiFi SSID detection requires `expo-network` or a native module.
 * This is a placeholder implementation that can be enhanced later.
 *
 * For now, the user can manually toggle local/remote per service in settings,
 * or use the global auto-switch toggle with their home SSID configured.
 */
export function useNetworkAutoSwitch() {
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const updateService = useConfigStore((s) => s.updateService);

  useEffect(() => {
    if (!autoSwitchNetwork) return;

    // TODO: Implement actual WiFi SSID detection
    // For now, this hook is a no-op placeholder.
    // When expo-network or a native module is added:
    //
    // 1. Get current WiFi SSID
    // 2. Compare with homeSSID from config store
    // 3. If on home network → set useRemote=false for all services
    // 4. If on other network → set useRemote=true for all services
    // 5. Listen for network changes and re-evaluate

  }, [autoSwitchNetwork, updateService]);
}
