import { describe, expect, it } from "vitest";
import { COMMON_CURRENCY_CODES, filterCurrencies, SUPPORTED_CURRENCIES } from "./currencies";

describe("supported currencies", () => {
  it("includes current everyday currencies", () => {
    expect(SUPPORTED_CURRENCIES).toContainEqual(["VND", "Vietnamese Dong"]);
    expect(SUPPORTED_CURRENCIES).toContainEqual(["XCG", "Caribbean Guilder"]);
    expect(SUPPORTED_CURRENCIES).toContainEqual(["ZWG", "Zimbabwe Gold"]);
  });

  it("omits historical and non-payment ISO units", () => {
    const codes = SUPPORTED_CURRENCIES.map(([code]) => code);
    expect(codes).not.toContain("BGN");
    expect(codes).not.toContain("XAU");
    expect(codes).not.toContain("XTS");
    expect(codes).not.toContain("XXX");
  });

  it("has unique codes and valid common currency shortcuts", () => {
    const codes = SUPPORTED_CURRENCIES.map(([code]) => code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(COMMON_CURRENCY_CODES.every((code) => codes.includes(code))).toBe(true);
  });

  it("searches names and codes and respects exclusions", () => {
    expect(filterCurrencies("dong")).toContainEqual(["VND", "Vietnamese Dong"]);
    expect(filterCurrencies("php")).toEqual([["PHP", "Philippine Peso"]]);
    expect(filterCurrencies("dollar", ["USD"]).some(([code]) => code === "USD")).toBe(false);
  });
});
