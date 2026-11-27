import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The iOS tunnel rule (#489, #394) is native code, so this builds
// ../ios/TunnelAddressRules.swift with the Swift harness next to this file and
// runs it. The cases live in TunnelAddressRulesTests.swift. Skipped where
// swiftc is not installed.
const hasSwiftc = spawnSync("swiftc", ["--version"]).status === 0;

(hasSwiftc ? describe : describe.skip)("iOS tunnel address rules (Swift)", () => {
  it("passes every case in TunnelAddressRulesTests.swift", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vpn-tunnel-rules-"));
    try {
      const bin = path.join(dir, "rules-test");
      execFileSync("swiftc", [
        "-parse-as-library",
        "-o",
        bin,
        path.join(__dirname, "../ios/TunnelAddressRules.swift"),
        path.join(__dirname, "TunnelAddressRulesTests.swift"),
      ]);
      const run = spawnSync(bin, { encoding: "utf8" });
      const failures = run.stdout.split("\n").filter((line) => line.startsWith("FAIL"));
      expect(failures).toEqual([]);
      expect(run.stdout).toContain("all passed");
      expect(run.status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
