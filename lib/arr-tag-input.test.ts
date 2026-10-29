import {
  addTagId,
  findTagByLabel,
  formatTagSummary,
  normalizeTagLabel,
  resolveTagInput,
  sameTagIds,
  tagLabelError,
  toggleTagId,
  upsertTag,
  validationFailureMessage,
} from "./arr-tag-input";
import type { ArrTag } from "@/lib/types";

const TAGS: ArrTag[] = [
  { id: 1, label: "4k" },
  { id: 2, label: "anime" },
  { id: 3, label: "kids" },
];

describe("normalizeTagLabel", () => {
  it("lowercases and trims, the way the server stores a new label", () => {
    expect(normalizeTagLabel("  Anime ")).toBe("anime");
    expect(normalizeTagLabel("HDR-10")).toBe("hdr-10");
  });

  it("leaves inner whitespace for validation to reject, never rewriting it", () => {
    expect(normalizeTagLabel("my tag")).toBe("my tag");
  });
});

describe("tagLabelError", () => {
  it("accepts letters, digits and dashes", () => {
    expect(tagLabelError("4k")).toBeNull();
    expect(tagLabelError("director-commentary")).toBeNull();
    expect(tagLabelError("-")).toBeNull();
  });

  it("asks for a name when empty", () => {
    expect(tagLabelError("")).toBe("Enter a tag name");
    expect(tagLabelError(normalizeTagLabel("   "))).toBe("Enter a tag name");
  });

  it.each(["my tag", "my_tag", "v1.0", "kids!", "tag\u{1F600}", "café"])(
    "rejects %p, which the server's /^[a-z0-9-]+$/ rule would 400",
    (label) => {
      expect(tagLabelError(label)).toBe("Only letters, numbers and - are allowed");
    },
  );
});

describe("findTagByLabel", () => {
  it("matches case-insensitively, so an existing tag is reused, not duplicated", () => {
    expect(findTagByLabel(TAGS, "Anime")).toEqual({ id: 2, label: "anime" });
    expect(findTagByLabel(TAGS, " KIDS ")).toEqual({ id: 3, label: "kids" });
  });

  it("matches a legacy mixed-case label on the server too", () => {
    expect(findTagByLabel([{ id: 9, label: "Rewatch" }], "rewatch")?.id).toBe(9);
  });

  it("returns undefined for a new label or a missing list", () => {
    expect(findTagByLabel(TAGS, "documentary")).toBeUndefined();
    expect(findTagByLabel(undefined, "anime")).toBeUndefined();
  });
});

describe("resolveTagInput", () => {
  it("selects an existing tag case-insensitively instead of creating one", () => {
    expect(resolveTagInput(TAGS, " Anime ")).toEqual({
      kind: "existing",
      tag: { id: 2, label: "anime" },
    });
  });

  it("selects an existing label the character rule would reject (Lidarr)", () => {
    const tags: ArrTag[] = [{ id: 7, label: "flac_24bit" }];
    expect(resolveTagInput(tags, "FLAC_24bit")).toEqual({
      kind: "existing",
      tag: { id: 7, label: "flac_24bit" },
    });
  });

  it("creates a new, valid label in its normalized form", () => {
    expect(resolveTagInput(TAGS, " Documentary ")).toEqual({
      kind: "create",
      label: "documentary",
    });
  });

  it("rejects an empty or invalid new label", () => {
    expect(resolveTagInput(TAGS, "   ")).toEqual({
      kind: "invalid",
      error: "Enter a tag name",
    });
    expect(resolveTagInput(TAGS, "my_tag")).toEqual({
      kind: "invalid",
      error: "Only letters, numbers and - are allowed",
    });
  });

  it("still validates when the tag list is unavailable", () => {
    expect(resolveTagInput(undefined, "kids")).toEqual({
      kind: "create",
      label: "kids",
    });
    expect(resolveTagInput(undefined, "my tag").kind).toBe("invalid");
  });
});

describe("upsertTag", () => {
  it("appends a new tag at the end, matching the server's id order", () => {
    expect(upsertTag(TAGS, { id: 4, label: "doc" })).toEqual([
      ...TAGS,
      { id: 4, label: "doc" },
    ]);
  });

  it("replaces by id instead of duplicating (the server returned an existing tag)", () => {
    const next = upsertTag(TAGS, { id: 2, label: "anime" });
    expect(next).toHaveLength(3);
    expect(next?.filter((t) => t.id === 2)).toHaveLength(1);
  });

  it("does not seed an unloaded list", () => {
    expect(upsertTag(undefined, { id: 4, label: "doc" })).toBeUndefined();
  });

  it("does not mutate the cached list", () => {
    const list = [...TAGS];
    upsertTag(list, { id: 4, label: "doc" });
    expect(list).toEqual(TAGS);
  });
});

describe("validationFailureMessage", () => {
  it("reads the first errorMessage of a FluentValidation body", () => {
    expect(
      validationFailureMessage([
        {
          propertyName: "Label",
          errorMessage: "Allowed characters a-z, 0-9 and -",
          severity: "error",
        },
      ]),
    ).toBe("Allowed characters a-z, 0-9 and -");
  });

  it("skips entries without a message", () => {
    expect(
      validationFailureMessage([{ propertyName: "Label" }, null, { errorMessage: "Too long" }]),
    ).toBe("Too long");
  });

  it("returns undefined for anything that is not a failure array", () => {
    expect(validationFailureMessage({ message: "nope" })).toBeUndefined();
    expect(validationFailureMessage("Bad Request")).toBeUndefined();
    expect(validationFailureMessage(undefined)).toBeUndefined();
    expect(validationFailureMessage([])).toBeUndefined();
  });
});

describe("addTagId / toggleTagId", () => {
  it("adds once", () => {
    expect(addTagId([1], 2)).toEqual([1, 2]);
    expect(addTagId([1, 2], 2)).toEqual([1, 2]);
  });

  it("toggles in and out", () => {
    expect(toggleTagId([1], 2)).toEqual([1, 2]);
    expect(toggleTagId([1, 2], 1)).toEqual([2]);
    expect(toggleTagId([], 3)).toEqual([3]);
  });
});

describe("sameTagIds", () => {
  it("ignores order and duplicates", () => {
    expect(sameTagIds([1, 2, 3], [3, 1, 2])).toBe(true);
    expect(sameTagIds([1, 1, 2], [2, 1])).toBe(true);
  });

  it("treats undefined as no tags", () => {
    expect(sameTagIds(undefined, [])).toBe(true);
    expect(sameTagIds([], undefined)).toBe(true);
    expect(sameTagIds(undefined, [1])).toBe(false);
  });

  it("detects an added or removed tag", () => {
    expect(sameTagIds([1, 2], [1])).toBe(false);
    expect(sameTagIds([1], [1, 2])).toBe(false);
    expect(sameTagIds([1, 2], [1, 3])).toBe(false);
  });
});

describe("formatTagSummary", () => {
  it("reads None for an untagged item", () => {
    expect(formatTagSummary([])).toBe("None");
  });

  it("lists up to two labels", () => {
    expect(formatTagSummary(["4k"])).toBe("4k");
    expect(formatTagSummary(["4k", "kids"])).toBe("4k, kids");
  });

  it("counts the rest", () => {
    expect(formatTagSummary(["4k", "kids", "anime", "doc", "rewatch"])).toBe(
      "4k, kids +3",
    );
  });
});
