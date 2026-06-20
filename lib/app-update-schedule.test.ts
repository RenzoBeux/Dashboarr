import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_SNOOZE_MS,
  shouldCheckForUpdate,
  shouldPromptForUpdate,
} from "@/lib/app-update-schedule";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("shouldCheckForUpdate", () => {
  it("checks on a fresh install (no prior check, no snooze)", () => {
    expect(
      shouldCheckForUpdate({ now: NOW, lastChecked: 0, snoozeUntil: 0 }),
    ).toBe(true);
  });

  it("throttles to once per day", () => {
    expect(
      shouldCheckForUpdate({
        now: NOW,
        lastChecked: NOW - (UPDATE_CHECK_INTERVAL_MS - 1),
        snoozeUntil: 0,
      }),
    ).toBe(false);
    expect(
      shouldCheckForUpdate({
        now: NOW,
        lastChecked: NOW - UPDATE_CHECK_INTERVAL_MS,
        snoozeUntil: 0,
      }),
    ).toBe(true);
  });

  it("stays silent for the whole snooze window even after the daily throttle lapses", () => {
    // Checked 2 days ago (throttle elapsed) but snoozed for another 5 days.
    expect(
      shouldCheckForUpdate({
        now: NOW,
        lastChecked: NOW - 2 * DAY,
        snoozeUntil: NOW + 5 * DAY,
      }),
    ).toBe(false);
  });

  it("resumes once the snooze window has passed", () => {
    expect(
      shouldCheckForUpdate({
        now: NOW,
        lastChecked: NOW - UPDATE_SNOOZE_MS,
        snoozeUntil: NOW - 1,
      }),
    ).toBe(true);
  });
});

describe("shouldPromptForUpdate", () => {
  it("prompts when a newer version exists and nothing was skipped", () => {
    expect(
      shouldPromptForUpdate({
        hasUpdate: true,
        storeVersion: "1.4.0",
        dismissedVersion: undefined,
      }),
    ).toBe(true);
  });

  it("does not prompt when already up to date", () => {
    expect(
      shouldPromptForUpdate({
        hasUpdate: false,
        storeVersion: "1.3.0",
        dismissedVersion: undefined,
      }),
    ).toBe(false);
  });

  it("does not prompt when the store version is unknown", () => {
    expect(
      shouldPromptForUpdate({
        hasUpdate: true,
        storeVersion: null,
        dismissedVersion: undefined,
      }),
    ).toBe(false);
  });

  it("never prompts again for a version the user skipped", () => {
    expect(
      shouldPromptForUpdate({
        hasUpdate: true,
        storeVersion: "1.4.0",
        dismissedVersion: "1.4.0",
      }),
    ).toBe(false);
  });

  it("prompts again once a newer version than the skipped one ships", () => {
    expect(
      shouldPromptForUpdate({
        hasUpdate: true,
        storeVersion: "1.5.0",
        dismissedVersion: "1.4.0",
      }),
    ).toBe(true);
  });
});
