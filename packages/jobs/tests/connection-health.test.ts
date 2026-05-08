import { describe, expect, it } from "vitest";
import { classifyConnectionHealth } from "../src/connection-health";

const fixedNow = new Date("2026-05-08T00:00:00Z");

describe("classifyConnectionHealth", () => {
  it("expiresAt = null → healthy", () => {
    expect(classifyConnectionHealth({ expiresAt: null, now: fixedNow })).toBe(
      "healthy"
    );
  });

  it("expiresAt 30 days out → healthy", () => {
    expect(
      classifyConnectionHealth({
        expiresAt: new Date(fixedNow.getTime() + 30 * 24 * 60 * 60 * 1000),
        now: fixedNow,
      })
    ).toBe("healthy");
  });

  it("expiresAt 5 days out → expiring_soon", () => {
    expect(
      classifyConnectionHealth({
        expiresAt: new Date(fixedNow.getTime() + 5 * 24 * 60 * 60 * 1000),
        now: fixedNow,
      })
    ).toBe("expiring_soon");
  });

  it("expiresAt exactly at boundary (7d) → expiring_soon", () => {
    expect(
      classifyConnectionHealth({
        expiresAt: new Date(fixedNow.getTime() + 7 * 24 * 60 * 60 * 1000),
        now: fixedNow,
      })
    ).toBe("expiring_soon");
  });

  it("expiresAt 1 day in past → expired", () => {
    expect(
      classifyConnectionHealth({
        expiresAt: new Date(fixedNow.getTime() - 24 * 60 * 60 * 1000),
        now: fixedNow,
      })
    ).toBe("expired");
  });

  it("expiresAt = now (boundary) → expired", () => {
    expect(
      classifyConnectionHealth({ expiresAt: fixedNow, now: fixedNow })
    ).toBe("expired");
  });
});
