import { serviceRequest } from "@/lib/http-client";
import type { ArrTag } from "@/lib/types";

// Radarr, Sonarr and Lidarr all expose their tag list at /tag with X-Api-Key
// auth and an identical { id, label } shape, so one function serves all three —
// the same call services/arr-custom-filters.ts already makes for /customfilter.
export type ArrTagService = "radarr" | "sonarr" | "lidarr";

export function getArrTags(
  service: ArrTagService,
  instanceId?: string,
): Promise<ArrTag[]> {
  return serviceRequest<ArrTag[]>(service, "/tag", { instanceId });
}

// POST /tag { label } answers 201 with the TagResource. When a tag with exactly
// that label already exists, TagService.Add returns it instead of inserting a
// duplicate, so the response may carry an existing id (issue #485). Callers pass
// a label already normalized by lib/arr-tag-input.ts.
export async function createArrTag(
  service: ArrTagService,
  label: string,
  instanceId?: string,
): Promise<ArrTag> {
  const tag = await serviceRequest<unknown>(service, "/tag", {
    method: "POST",
    body: JSON.stringify({ label }),
    instanceId,
  });
  if (
    !tag ||
    typeof tag !== "object" ||
    typeof (tag as ArrTag).id !== "number" ||
    typeof (tag as ArrTag).label !== "string"
  ) {
    throw new Error("Unexpected response creating tag");
  }
  return { id: (tag as ArrTag).id, label: (tag as ArrTag).label };
}
