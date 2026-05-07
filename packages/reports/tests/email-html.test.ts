import { describe, expect, it } from "vitest";
import { toEmailHtml } from "../src/email-html";
import { fixture } from "./fixture";

describe("toEmailHtml", () => {
  const html = toEmailHtml(fixture, {
    appUrl: "https://app.aicfo.example",
    orgName: "Acme Co",
  });

  it("opens with the doctype and includes the org name", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Acme Co");
  });

  it("renders every flag's narrative", () => {
    for (const f of fixture.flags) {
      expect(html).toContain(f.narrative);
    }
  });

  it("renders feedback links with trace_id and signal=positive/negative/correction", () => {
    expect(html).toContain(
      `trace=${encodeURIComponent(fixture.metadata.trace_id)}&signal=positive`
    );
    expect(html).toContain(
      `trace=${encodeURIComponent(fixture.metadata.trace_id)}&signal=negative`
    );
    expect(html).toContain(
      `trace=${encodeURIComponent(fixture.metadata.trace_id)}&signal=correction`
    );
  });

  it("escapes HTML in narrative text", () => {
    const evil = {
      ...fixture,
      summary: '<script>alert("xss")</script>',
    };
    const out = toEmailHtml(evil);
    expect(out).not.toContain("<script>alert");
    expect(out).toContain("&lt;script&gt;alert");
  });

  it("rejects a malformed DailyReport (Zod schema gate)", () => {
    const bad = { ...fixture, date: "not-a-date" } as unknown as typeof fixture;
    expect(() => toEmailHtml(bad)).toThrow();
  });
});
