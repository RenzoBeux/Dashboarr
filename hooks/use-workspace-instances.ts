import { useMemo } from "react";
import type { ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useAttachedInstances } from "@/hooks/use-active-dashboard";
import { findSameHostInstance } from "@/lib/instance-host-match";
import {
  resolveBoundInstances,
  isExplicitInstanceBinding,
  type StoredInstanceBinding,
} from "@/components/dashboard/widget-settings/instance-picker-row";

/**
 * Apply the active workspace's attachment filter to an already binding-resolved
 * instance list.
 *
 * An EXPLICIT per-widget binding (a specific id or a non-empty subset) is a
 * deliberate choice and WINS over the workspace filter — the picker lists every
 * enabled instance, so a user who pins one that isn't attached reasonably
 * expects it to show (mirrors ServiceHealthCard and the #106 rule). The default
 * "all" aggregate is scoped to the dashboard's attached instances so a curated
 * workspace never shows — or polls — an instance it didn't attach (#148 review
 * Rec #1, which was previously enforced only inside ServiceHealthCard).
 */
export function scopeInstancesToWorkspace<T extends { id: string }>(
  resolved: T[],
  binding: StoredInstanceBinding,
  attached: ReadonlySet<string>,
): T[] {
  return isExplicitInstanceBinding(binding)
    ? resolved
    : resolved.filter((i) => attached.has(i.id));
}

/**
 * Enabled instances of a kind that are attached to the active workspace —
 * ignoring any per-widget binding. This is the set a workspace's widget SETTINGS
 * should reason about: which kinds to surface, and which instances the picker
 * may offer (#148 review Rec #7). Auto-attach dashboards (attachedInstances ===
 * undefined) resolve to every enabled instance, so nothing is hidden there.
 *
 * Memoized for a stable reference across renders.
 */
export function useAttachedEnabledInstances(
  serviceId: ServiceId,
): ServiceInstance[] {
  const enabled = useEnabledInstances(serviceId);
  const attached = useAttachedInstances();
  return useMemo(
    () => enabled.filter((i) => attached.has(i.id)),
    [enabled, attached],
  );
}

/**
 * The instance of `kind` that runs on the same host as `target`, or undefined
 * when there is none. Use this — never the active instance — before rendering
 * one service's data against another's; see lib/instance-host-match.ts for why
 * an unguarded pairing shows the wrong machine's numbers.
 *
 * Attachment-scoped, not merely enabled: an instance the user detached from the
 * active dashboard must not be queried here, and must never shadow an attached
 * one. Auto-attach dashboards still see every enabled instance.
 */
export function useSameHostInstance(
  serviceId: ServiceId,
  target: { localUrl: string; remoteUrl: string } | undefined,
): ServiceInstance | undefined {
  const candidates = useAttachedEnabledInstances(serviceId);
  // Depend on the URLs, not the instance object: unrelated edits to the target
  // (renames, profile defaults) shouldn't re-run the match. A missing target
  // reduces to two blank URLs, which findSameHostInstance already rejects.
  const localUrl = target?.localUrl ?? "";
  const remoteUrl = target?.remoteUrl ?? "";
  return useMemo(
    () => findSameHostInstance({ localUrl, remoteUrl }, candidates),
    [candidates, localUrl, remoteUrl],
  );
}

/**
 * Workspace-scoped, binding-resolved enabled instances for a kind — the
 * one-call replacement for the `useEnabledInstances(kind)` + `resolveBoundInstances`
 * pattern in fan-out dashboard cards. Pass `undefined`/`"all"` as the binding
 * for cards without a per-widget instance picker.
 *
 * Memoized so the returned array keeps a stable reference across renders when
 * nothing changed — the resolve+filter would otherwise allocate a fresh array
 * every render, which matters for the `useQueries` consumers downstream.
 */
export function useWorkspaceScopedInstances(
  serviceId: ServiceId,
  binding: StoredInstanceBinding,
): ServiceInstance[] {
  const allEnabled = useEnabledInstances(serviceId);
  const attached = useAttachedInstances();
  return useMemo(
    () =>
      scopeInstancesToWorkspace(
        resolveBoundInstances(binding, allEnabled),
        binding,
        attached,
      ),
    [binding, allEnabled, attached],
  );
}
