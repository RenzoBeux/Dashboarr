import { resolveRequestUser } from "./overseerr-request-user";

describe("resolveRequestUser", () => {
  describe("no opinion from the caller (no userId key)", () => {
    it("applies the stored default when options are undefined", () => {
      expect(resolveRequestUser(undefined, 7)).toEqual({ userId: 7 });
    });

    it("applies the stored default alongside existing options", () => {
      expect(resolveRequestUser({ serverId: 1, is4k: true }, 7)).toEqual({
        serverId: 1,
        is4k: true,
        userId: 7,
      });
    });

    it("leaves options untouched when there is no stored default", () => {
      expect(resolveRequestUser({ serverId: 1 }, undefined)).toEqual({ serverId: 1 });
      expect(resolveRequestUser(undefined, undefined)).toBeUndefined();
    });

    it("does not mutate the caller's options object", () => {
      const options = { serverId: 1 };
      resolveRequestUser(options, 7);
      expect(options).toEqual({ serverId: 1 });
    });
  });

  describe("an explicit choice from the caller", () => {
    it("wins over the stored default", () => {
      expect(resolveRequestUser({ userId: 3 }, 7)).toEqual({ userId: 3 });
    });

    it("applies when there is no stored default", () => {
      expect(resolveRequestUser({ userId: 3 }, undefined)).toEqual({ userId: 3 });
    });
  });

  // The regression this module exists for: the request sheet's "API key owner"
  // option sets the key to undefined, and a `??` fallback would quietly put the
  // stored default back, making that option do nothing.
  describe('explicit "API key owner" (key present, value undefined)', () => {
    it("suppresses the stored default", () => {
      const resolved = resolveRequestUser({ userId: undefined }, 7);
      expect(resolved?.userId).toBeUndefined();
    });

    it("keeps the rest of the options and sends no userId on the wire", () => {
      const resolved = resolveRequestUser(
        { serverId: 1, userId: undefined },
        7,
      );
      expect(resolved).toEqual({ serverId: 1, userId: undefined });
      expect(JSON.parse(JSON.stringify({ mediaId: 42, ...resolved }))).toEqual({
        mediaId: 42,
        serverId: 1,
      });
    });
  });
});
