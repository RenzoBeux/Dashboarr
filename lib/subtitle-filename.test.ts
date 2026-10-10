import { hasSubtitleExtension, parseSubtitleFilename } from "./subtitle-filename";

describe("hasSubtitleExtension", () => {
  it("accepts subtitle formats in any case", () => {
    expect(hasSubtitleExtension("Film.de.SRT")).toBe(true);
    expect(hasSubtitleExtension("Film.ass")).toBe(true);
    expect(hasSubtitleExtension("Film.vtt")).toBe(true);
  });

  it("rejects other files", () => {
    expect(hasSubtitleExtension("Film.mkv")).toBe(false);
    expect(hasSubtitleExtension("notes")).toBe(false);
  });
});

describe("parseSubtitleFilename", () => {
  it.each([
    ["Film (2023).de.forced.srt", { code2: "de", forced: true, hi: false }],
    ["Show.S01E02.en.sdh.srt", { code2: "en", forced: false, hi: true }],
    ["Show.S01E02.en.hi.srt", { code2: "en", forced: false, hi: true }],
    ["Film.fre.srt", { code2: "fr", forced: false, hi: false }],
    ["Film.pt-BR.srt", { code2: "pb", forced: false, hi: false }],
    ["Film.hi.srt", { code2: "hi", forced: false, hi: false }],
    ["Film.hi.sdh.srt", { code2: "hi", forced: false, hi: true }],
    ["Film.srt", { code2: undefined, forced: false, hi: false }],
    ["Film.2023.1080p.srt", { code2: undefined, forced: false, hi: false }],
    ["Film.2023.1080p.de.srt", { code2: "de", forced: false, hi: false }],
    ["Spider-Man.No.Way.Home.srt", { code2: undefined, forced: false, hi: false }],
    ["Film.Japanese.srt", { code2: "ja", forced: false, hi: false }],
    ["A.Foreign.Affair.de.srt", { code2: "de", forced: false, hi: false }],
    ["Say.Hi.to.Me.en.srt", { code2: "en", forced: false, hi: false }],
    ["Film.forced.de.srt", { code2: "de", forced: true, hi: false }],
  ])("reads %s", (name, expected) => {
    expect(parseSubtitleFilename(name)).toEqual(expected);
  });
});
