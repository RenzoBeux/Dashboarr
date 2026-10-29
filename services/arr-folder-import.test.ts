jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import { INTERACTIVE_SEARCH_TIMEOUT } from "@/lib/constants";
import {
  getFolderImportCandidates as getRadarrFolderCandidates,
  getManualImportCandidates as getRadarrDownloadCandidates,
  rescanMovie,
  runManualImport as runRadarrManualImport,
} from "@/services/radarr-api";
import {
  getFolderImportCandidates as getSonarrFolderCandidates,
  rescanSeries,
  runManualImport as runSonarrManualImport,
} from "@/services/sonarr-api";
import { getArrFolderContents } from "@/services/arr-filesystem";

// Wire shapes for "Rescan folder" and "Import from folder" (#470), checked
// against Radarr/Sonarr develop. These fail silently against a real server
// (a wrong command name is a 404 body the UI toasts as "started"), so the
// exact requests are pinned here.

const mockRequest = serviceRequest as jest.Mock;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(undefined);
});

function lastBody(): unknown {
  const [, , options] = mockRequest.mock.calls[mockRequest.mock.calls.length - 1];
  return JSON.parse(options.body);
}

describe("Rescan folder", () => {
  it("sends RescanMovie for one movie, not RefreshMovie", async () => {
    await rescanMovie(42, "inst-1");
    expect(mockRequest).toHaveBeenCalledWith("radarr", "/command", {
      method: "POST",
      body: JSON.stringify({ name: "RescanMovie", movieId: 42 }),
      instanceId: "inst-1",
    });
  });

  it("sends RescanSeries for one series, not RefreshSeries", async () => {
    await rescanSeries(7, "inst-2");
    expect(mockRequest).toHaveBeenCalledWith("sonarr", "/command", {
      method: "POST",
      body: JSON.stringify({ name: "RescanSeries", seriesId: 7 }),
      instanceId: "inst-2",
    });
  });
});

describe("folder candidates", () => {
  // With movieId/seriesId and no downloadId, /manualimport returns the title's
  // existing files and ignores `folder`, so the params must be exactly these.
  it.each([
    ["radarr", getRadarrFolderCandidates],
    ["sonarr", getSonarrFolderCandidates],
  ] as const)("%s scans the folder alone, hiding imported files", async (service, fetch) => {
    const signal = new AbortController().signal;
    await fetch("/downloads/manual/", "inst-1", signal);
    expect(mockRequest).toHaveBeenCalledWith(service, "/manualimport", {
      params: { folder: "/downloads/manual/", filterExistingFiles: true },
      timeout: INTERACTIVE_SEARCH_TIMEOUT,
      instanceId: "inst-1",
      signal,
    });
  });

  it("leaves the download lookup unchanged", async () => {
    await getRadarrDownloadCandidates("abc123", "inst-1");
    expect(mockRequest).toHaveBeenCalledWith("radarr", "/manualimport", {
      params: { downloadId: "abc123", filterExistingFiles: false },
      instanceId: "inst-1",
    });
  });
});

describe("ManualImport importMode", () => {
  it("defaults to auto, as the download import always sent", async () => {
    await runRadarrManualImport([], "inst-1");
    expect(lastBody()).toEqual({ name: "ManualImport", files: [], importMode: "auto" });
  });

  it.each(["move", "copy"] as const)("passes %s through on both services", async (mode) => {
    await runRadarrManualImport([], "inst-1", mode);
    expect(lastBody()).toEqual({ name: "ManualImport", files: [], importMode: mode });
    await runSonarrManualImport([], "inst-1", mode);
    expect(lastBody()).toEqual({ name: "ManualImport", files: [], importMode: mode });
  });
});

describe("getArrFolderContents", () => {
  it("lists folders only, accepting a path without the trailing separator", async () => {
    const signal = new AbortController().signal;
    await getArrFolderContents("sonarr", "", "inst-1", signal);
    expect(mockRequest).toHaveBeenCalledWith("sonarr", "/filesystem", {
      params: { path: "", includeFiles: false, allowFoldersWithoutTrailingSlashes: true },
      instanceId: "inst-1",
      signal,
    });
  });
});
