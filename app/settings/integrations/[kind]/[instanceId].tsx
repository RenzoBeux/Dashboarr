import { useCallback } from "react";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { ServiceEditor } from "@/components/integrations/service-editor";
import { useConfigStore } from "@/store/config-store";
import { EMPTY_INSTANCES } from "@/components/settings/service-kind-shared";
import { SERVICE_IDS, type ServiceId } from "@/lib/constants";

/**
 * Per-instance editor route.
 *
 * Thin on purpose: the form itself is components/integrations/service-editor.tsx.
 * This file only resolves and validates the params, and owns the back target.
 */
export default function InstanceEditorRoute() {
  const router = useRouter();
  const { kind, instanceId, new: isNew } = useLocalSearchParams<{
    kind: string;
    instanceId: string;
    new?: string;
  }>();

  const validKind = SERVICE_IDS.includes(kind as ServiceId)
    ? (kind as ServiceId)
    : null;

  const exists = useConfigStore((s) =>
    validKind
      ? (s.serviceInstances[validKind] ?? EMPTY_INSTANCES).some(
          (i) => i.id === instanceId,
        )
      : false,
  );

  // A cold-start deep link can name a kind that never existed or an instance
  // the user has since deleted. Land on the hub rather than a dead screen.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/settings/integrations");
  }, [router]);

  if (!validKind || !exists) return <Redirect href="/settings/integrations" />;

  return (
    // Keyed by instance id so the form fully remounts when switching between
    // instances of the same kind. The fields seed from the store via useState
    // initializers, which run once per mount; without the key a stale value
    // could be saved over a good stored URL (#106).
    <ServiceEditor
      key={instanceId}
      serviceId={validKind}
      instanceId={instanceId}
      isNew={isNew === "1"}
      onBack={goBack}
      onDeleted={goBack}
    />
  );
}
