import { generateInstanceId, setInstanceIdGenerator } from "./instance-id";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => setInstanceIdGenerator(null));

describe("generateInstanceId", () => {
  it("produces v4-shaped, unique ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateInstanceId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it("a registered generator wins", () => {
    setInstanceIdGenerator(() => "fixed-id");
    expect(generateInstanceId()).toBe("fixed-id");
  });

  it("falls through when the registered generator returns nothing", () => {
    setInstanceIdGenerator(() => "");
    expect(generateInstanceId()).toMatch(V4);
  });

  it("works without globalThis.crypto", () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      expect(generateInstanceId()).toMatch(V4);
    } finally {
      if (saved) Object.defineProperty(globalThis, "crypto", saved);
    }
  });
});
