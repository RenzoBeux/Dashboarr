import {
  isScannableFolder,
  normalizeFolderListing,
  samePath,
  withTrailingSeparator,
} from "@/lib/arr-filesystem";

describe("normalizeFolderListing", () => {
  it("keeps every directory the server gave a path for", () => {
    expect(
      normalizeFolderListing({
        parent: "/",
        directories: [
          { type: "folder", name: "downloads", path: "/downloads/" },
          { type: "folder", name: "", path: "/movies/" },
          { type: "folder", name: "ghost" },
        ],
        files: [],
      }),
    ).toEqual({
      up: "/",
      folders: [
        { name: "downloads", path: "/downloads/", isDrive: false },
        // A record without a name still renders as its last segment.
        { name: "movies", path: "/movies/", isDrive: false },
      ],
    });
  });

  it("flags Windows drives", () => {
    const listing = normalizeFolderListing({
      directories: [{ type: "drive", name: "C:\\ (System)", path: "C:\\" }],
    });
    expect(listing.folders).toEqual([
      { name: "C:\\ (System)", path: "C:\\", isDrive: true },
    ]);
  });

  // `parent` drives the Up row: a path, "" for the drive list above a Windows
  // drive root, and absent (or null) at the very top.
  it("maps parent to the Up target", () => {
    expect(normalizeFolderListing({ parent: "/data/" }).up).toBe("/data/");
    expect(normalizeFolderListing({ parent: "" }).up).toBe("");
    expect(normalizeFolderListing({ parent: null }).up).toBeNull();
    expect(normalizeFolderListing({}).up).toBeNull();
  });

  it("tolerates a missing body", () => {
    expect(normalizeFolderListing(undefined)).toEqual({ up: null, folders: [] });
  });
});

describe("withTrailingSeparator", () => {
  it("appends the separator the path already uses", () => {
    expect(withTrailingSeparator("/data")).toBe("/data/");
    expect(withTrailingSeparator("/data/")).toBe("/data/");
    expect(withTrailingSeparator("C:\\Media")).toBe("C:\\Media\\");
    expect(withTrailingSeparator("D:")).toBe("D:\\");
    expect(withTrailingSeparator("\\\\nas\\share")).toBe("\\\\nas\\share\\");
  });

  it("trims and leaves an empty path empty", () => {
    expect(withTrailingSeparator("  /data ")).toBe("/data/");
    expect(withTrailingSeparator("   ")).toBe("");
  });
});

describe("samePath", () => {
  it("ignores the trailing separator", () => {
    expect(samePath("/movies", "/movies/")).toBe(true);
    expect(samePath("C:\\Movies\\", "C:\\Movies")).toBe(true);
    expect(samePath("/movies", "/movies/Alien/")).toBe(false);
  });
});

describe("isScannableFolder", () => {
  it("refuses the start view, the server root and the drive list", () => {
    expect(isScannableFolder(null)).toBe(false);
    expect(isScannableFolder("")).toBe(false);
    expect(isScannableFolder("/")).toBe(false);
    expect(isScannableFolder("/downloads/manual/")).toBe(true);
    expect(isScannableFolder("D:\\Import\\")).toBe(true);
  });
});
