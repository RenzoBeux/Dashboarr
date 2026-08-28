import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Check, SearchX } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ServiceLogo } from "@/components/ui/service-logo";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SERVICE_DEFAULTS_KIND_LABEL } from "@/components/settings/service-kind-shared";
import { useConfigStore } from "@/store/config-store";
import { lightHaptic } from "@/lib/haptics";
import {
  SERVICE_CATALOG,
  CATEGORY_ORDER,
  SERVICE_CATEGORY_LABELS,
  servicesInCategory,
  filterCatalog,
} from "@/lib/service-catalog";
import { isConfigured, resolveBrowseRoute } from "@/lib/integration-status";
import type { ServiceId } from "@/lib/constants";

/**
 * The full service catalog: search plus category sections.
 *
 * Browsing never writes to the store. Every kind already owns a seeded
 * placeholder instance (defaultInstances()), so tapping an unconfigured
 * service opens that slot's editor rather than creating a second one.
 */
export default function BrowseIntegrations() {
  const router = useRouter();
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  // Not debounced on purpose: this filters 25 in-memory strings and never
  // touches the network. app/search.tsx debounces at 300ms because every
  // keystroke there fires a request per service.
  const results = useMemo(() => filterCatalog(trimmed), [trimmed]);

  const open = (kind: ServiceId) => {
    lightHaptic();
    router.push(resolveBrowseRoute(kind, serviceInstances[kind] ?? []) as never);
  };

  const renderRow = (kind: ServiceId) => {
    const instances = serviceInstances[kind] ?? [];
    const configured = isConfigured(instances);
    // An already-configured kind lands on its instance list, so say what the
    // tap is for rather than leaving "Already set up" reading as a dead end.
    const count = instances.filter(
      (i) => i.localUrl.length > 0 || i.remoteUrl.length > 0,
    ).length;
    return (
      <SettingsRow
        key={kind}
        leading={<ServiceLogo id={kind} size={20} online={configured} />}
        label={SERVICE_DEFAULTS_KIND_LABEL[kind]}
        subtitle={
          configured
            ? `${count} set up · tap to add another`
            : SERVICE_CATALOG[kind].tagline
        }
        right={
          configured ? <Icon icon={Check} size={16} color="#22c55e" /> : null
        }
        onPress={() => open(kind)}
      />
    );
  };

  return (
    <ScreenWrapper>
      <BackHeader title="Add a service" />

      <TextInput
        placeholder="Search services"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        containerClassName="mb-4"
      />

      {trimmed.length === 0 ? (
        // Default view is already grouped by category, so there is no chip row
        // on top of it — that would be a second control for a distinction the
        // page has already made.
        CATEGORY_ORDER.map((category, i) => (
          <Animated.View
            key={category}
            entering={FadeInDown.delay(Math.min(i, 4) * 35).duration(240)}
          >
            <SettingsGroup title={SERVICE_CATEGORY_LABELS[category]}>
              {servicesInCategory(category).map(renderRow)}
            </SettingsGroup>
          </Animated.View>
        ))
      ) : results.length > 0 ? (
        <SettingsGroup title="Results">{results.map(renderRow)}</SettingsGroup>
      ) : (
        <EmptyState
          icon={<Icon icon={SearchX} size={32} color="#71717a" />}
          title="No services match"
          message={`Nothing for "${trimmed}". Try a different name.`}
        />
      )}
    </ScreenWrapper>
  );
}
