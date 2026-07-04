import {
  normalizeRadarrHistory,
  normalizeSonarrHistory,
  historyEventMeta,
  HISTORY_TONE_COLOR,
} from "@/lib/arr-history";
import type { RadarrHistoryRecord, SonarrHistoryRecord } from "@/lib/types";

describe("normalizeRadarrHistory", () => {
  it("pulls release, indexer, group, size and client from a grabbed record", () => {
    const record: RadarrHistoryRecord = {
      id: 42,
      eventType: "grabbed",
      sourceTitle: "Dune.Part.Two.2024.2160p.WEB-DL-GROUP",
      date: "2024-11-02T20:14:00Z",
      quality: { quality: { id: 19, name: "WEBDL-2160p" } },
      data: {
        indexer: "NZBgeek",
        releaseGroup: "GROUP",
        size: "64424509440",
        downloadClient: "SABnzbd",
        protocol: "usenet",
      },
    };
    const entry = normalizeRadarrHistory(record);
    expect(entry).toMatchObject({
      id: 42,
      eventType: "grabbed",
      title: "Dune.Part.Two.2024.2160p.WEB-DL-GROUP",
      indexer: "NZBgeek",
      releaseGroup: "GROUP",
      qualityName: "WEBDL-2160p",
      sizeBytes: 64424509440,
      downloadClient: "SABnzbd",
      protocol: "usenet",
    });
  });

  it("falls back to the event label and leaves fields undefined when data is absent", () => {
    const record: RadarrHistoryRecord = {
      id: 7,
      eventType: "movieFileDeleted",
    };
    const entry = normalizeRadarrHistory(record);
    expect(entry.title).toBe("File Deleted");
    expect(entry.indexer).toBeUndefined();
    expect(entry.sizeBytes).toBeUndefined();
    expect(entry.qualityName).toBeUndefined();
    expect(entry.languages).toEqual([]);
  });

  it("drops a zero or non-numeric size instead of surfacing 0 bytes", () => {
    expect(
      normalizeRadarrHistory({ id: 1, eventType: "grabbed", data: { size: "0" } })
        .sizeBytes,
    ).toBeUndefined();
    expect(
      normalizeRadarrHistory({ id: 2, eventType: "grabbed", data: { size: "" } })
        .sizeBytes,
    ).toBeUndefined();
  });

  it("prefers downloadClient but falls back to downloadClientName", () => {
    expect(
      normalizeRadarrHistory({
        id: 3,
        eventType: "grabbed",
        data: { downloadClientName: "qBittorrent" },
      }).downloadClient,
    ).toBe("qBittorrent");
  });
});

describe("normalizeSonarrHistory", () => {
  it("normalizes an import record and its languages", () => {
    const record: SonarrHistoryRecord = {
      id: 900,
      eventType: "downloadFolderImported",
      sourceTitle: "House.of.the.Dragon.S02E03.1080p-GRP",
      date: "2024-06-30T12:00:00Z",
      quality: { quality: { id: 4, name: "WEBDL-1080p" } },
      languages: [{ id: 1, name: "English" }],
      data: { indexer: "DrunkenSlug", releaseGroup: "GRP" },
    };
    const entry = normalizeSonarrHistory(record);
    expect(entry.title).toBe("House.of.the.Dragon.S02E03.1080p-GRP");
    expect(entry.indexer).toBe("DrunkenSlug");
    expect(entry.qualityName).toBe("WEBDL-1080p");
    expect(entry.languages).toEqual(["English"]);
  });
});

describe("historyEventMeta", () => {
  it("maps known event types to a label and tone", () => {
    expect(historyEventMeta("grabbed")).toMatchObject({
      label: "Grabbed",
      tone: "grab",
    });
    expect(historyEventMeta("downloadFailed").tone).toBe("danger");
    expect(historyEventMeta("downloadFolderImported").label).toBe("Imported");
  });

  it("prettifies unknown camelCase event types", () => {
    expect(historyEventMeta("seriesFolderImported").label).toBe(
      "Series Folder Imported",
    );
    expect(historyEventMeta("").label).toBe("Event");
  });

  it("exposes a color for every tone it returns", () => {
    for (const type of ["grabbed", "downloadFailed", "movieFileDeleted", "x"]) {
      expect(HISTORY_TONE_COLOR[historyEventMeta(type).tone]).toMatch(/^#/);
    }
  });
});
