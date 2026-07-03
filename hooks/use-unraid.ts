import {
  getUnraidContainers,
  getUnraidStorage,
  restartUnraidContainer,
  startUnraidContainer,
  stopUnraidContainer,
} from "@/services/unraid-api";
import { useServiceQuery, useServiceMutation } from "@/hooks/use-service-query";

// Containers change state on user action; storage (array/disks) barely moves.
// 10s keeps container state fresh without tripping the API's rate limiter;
// 30s matches the glances fs poll for disks.
const CONTAINERS_POLL = 10000;
const STORAGE_POLL = 30000;

export function useUnraidContainers(instanceId?: string) {
  return useServiceQuery(
    "unraid",
    ["containers"],
    getUnraidContainers,
    CONTAINERS_POLL,
    instanceId,
  );
}

export function useUnraidStorage(instanceId?: string) {
  return useServiceQuery(
    "unraid",
    ["storage"],
    getUnraidStorage,
    STORAGE_POLL,
    instanceId,
  );
}

// Mutations invalidate the whole ["unraid", instanceId] slice on success (the
// useServiceMutation default), which refetches the containers list. No
// optimistic cache surgery — the mutation only resolves once the server has
// applied the transition, and per-row busy state covers the in-flight gap.

export function useStartUnraidContainer(instanceId?: string) {
  return useServiceMutation(
    "unraid",
    (containerId: string, id) => startUnraidContainer(containerId, id),
    instanceId,
  );
}

export function useStopUnraidContainer(instanceId?: string) {
  return useServiceMutation(
    "unraid",
    (containerId: string, id) => stopUnraidContainer(containerId, id),
    instanceId,
  );
}

export function useRestartUnraidContainer(instanceId?: string) {
  return useServiceMutation(
    "unraid",
    (containerId: string, id) => restartUnraidContainer(containerId, id),
    instanceId,
  );
}
