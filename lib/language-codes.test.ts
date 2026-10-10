import { normalizeLanguage, parseLanguageList } from "./language-codes";

describe("normalizeLanguage", () => {
  it.each([
    ["en", "en"],
    ["eng", "en"],
    ["English", "en"],
    ["ger", "de"],
    ["deu", "de"],
    ["German", "de"],
    ["fre", "fr"],
    ["fra", "fr"],
    ["dut", "nl"],
    ["Flemish", "nl"],
    ["chi", "zh"],
    ["zho", "zh"],
    ["cze", "cs"],
    ["ces", "cs"],
    ["gre", "el"],
    ["rum", "ro"],
    ["slo", "sk"],
    ["per", "fa"],
    ["ice", "is"],
  ])("reads %s as %s", (input, code2) => {
    expect(normalizeLanguage(input)?.code2).toBe(code2);
  });

  it("knows Bazarr's regional pseudo-codes and the arr names for them", () => {
    expect(normalizeLanguage("pb")?.name).toBe("Portuguese (Brazil)");
    expect(normalizeLanguage("Portuguese (Brazil)")?.code2).toBe("pb");
    expect(normalizeLanguage("zt")?.code2).toBe("zt");
    expect(normalizeLanguage("ea")?.code2).toBe("ea");
  });

  it("maps region tags to variants or their base language", () => {
    expect(normalizeLanguage("pt-BR")?.code2).toBe("pb");
    expect(normalizeLanguage("zh_TW")?.code2).toBe("zt");
    expect(normalizeLanguage("es-419")?.code2).toBe("ea");
    expect(normalizeLanguage("en-US")?.code2).toBe("en");
    expect(normalizeLanguage("de-CH")?.code2).toBe("de");
  });

  it("returns the ISO 639-2/B code3", () => {
    expect(normalizeLanguage("deu")?.code3).toBe("ger");
  });

  it("is null for empty, unknown and undetermined tags", () => {
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
    expect(normalizeLanguage("und")).toBeNull();
    expect(normalizeLanguage("Klingon")).toBeNull();
  });

  it("ignores case and whitespace", () => {
    expect(normalizeLanguage("  ENG ")?.code2).toBe("en");
  });
});

describe("parseLanguageList", () => {
  it("dedupes tracks of the same language in first-seen order", () => {
    expect(parseLanguageList("English/English/German").map((l) => l.code2)).toEqual([
      "en",
      "de",
    ]);
    expect(parseLanguageList("ger/eng/deu").map((l) => l.code2)).toEqual(["de", "en"]);
  });

  it("drops unknown parts and handles empty input", () => {
    expect(parseLanguageList("eng/und/xx").map((l) => l.code2)).toEqual(["en"]);
    expect(parseLanguageList("")).toEqual([]);
    expect(parseLanguageList(undefined)).toEqual([]);
  });

  it("accepts commas", () => {
    expect(parseLanguageList("eng, fre").map((l) => l.code2)).toEqual(["en", "fr"]);
  });
});
