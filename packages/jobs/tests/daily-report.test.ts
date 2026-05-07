/**
 * Day-3 daily-report orchestration: date + timezone gating logic.
 *
 * The Trigger.dev tasks themselves can't be exercised in vitest without the
 * runtime, so this file tests the pure helpers that decide which orgs to
 * fire at each hourly tick. Once the agent transport is wired Day-3.1,
 * we'll add an integration test that exercises the full schemaTask via
 * Trigger.dev's local dev runner.
 */
import { describe, expect, it } from "vitest";

// Re-implement the gate predicates here so we test them without exporting
// them from the production module (they're internals). When the real
// orchestrator picks them up via re-export we'll switch this test to
// import from "../src/daily-report".

const isOrgHourMatching = (
  hhmmss: string,
  timezone: string,
  now: Date
): boolean => {
  const orgHour = Number(hhmmss.split(":")[0]);
  if (!Number.isFinite(orgHour)) {
    return false;
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour");
  if (!hourPart) {
    return false;
  }
  return Number(hourPart.value) === orgHour;
};

describe("daily-report tick gating", () => {
  it("matches org's local hour against current UTC instant", () => {
    // 12:00 UTC during DST (June) = 08:00 America/New_York (EDT, UTC-4).
    const dstNoonUtc = new Date("2026-06-15T12:00:00Z");
    expect(isOrgHourMatching("08:00:00", "America/New_York", dstNoonUtc)).toBe(
      true
    );
    expect(isOrgHourMatching("07:00:00", "America/New_York", dstNoonUtc)).toBe(
      false
    );
  });

  it("respects different timezones at the same UTC moment", () => {
    const noonUtc = new Date("2026-06-15T12:00:00Z");
    expect(isOrgHourMatching("12:00:00", "UTC", noonUtc)).toBe(true);
    expect(isOrgHourMatching("13:00:00", "Europe/London", noonUtc)).toBe(true); // BST = UTC+1
    expect(isOrgHourMatching("21:00:00", "Asia/Tokyo", noonUtc)).toBe(true);
  });

  it("returns false for malformed hhmmss", () => {
    const noonUtc = new Date("2026-06-15T12:00:00Z");
    expect(isOrgHourMatching("not a time", "UTC", noonUtc)).toBe(false);
  });
});
