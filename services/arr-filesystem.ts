import { serviceRequest } from "@/lib/http-client";
import type { ArrFsResult, ArrFsService } from "@/lib/arr-filesystem";

// Radarr and Sonarr serve the same Servarr folder browser at /filesystem, so
// one function covers both (the services/arr-tags.ts pattern). Shape and
// path semantics are documented in lib/arr-filesystem.ts.
//
// `allowFoldersWithoutTrailingSlashes` lists an existing folder as-is even
// without the separator (what the *arr web UI's own browser sends), and
// `includeFiles: false` keeps the response to the folders the browser can
// open. An empty `path` is valid: it lists the server root.
export function getArrFolderContents(
  service: ArrFsService,
  path: string,
  instanceId?: string,
  signal?: AbortSignal,
): Promise<ArrFsResult> {
  return serviceRequest<ArrFsResult>(service, "/filesystem", {
    params: { path, includeFiles: false, allowFoldersWithoutTrailingSlashes: true },
    instanceId,
    signal,
  });
}
