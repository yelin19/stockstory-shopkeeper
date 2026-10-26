import { describe, expect, it } from "vitest";
import { parseProductRequest, usernameToEmail } from "@/lib/messenger-parse";

describe("parseProductRequest", () => {
  it("reads a bare product code", () => {
    expect(parseProductRequest("111")).toEqual({ code: "111", qty: null });
  });
  it("reads '111 2' as two units", () => {
    expect(parseProductRequest("111 2")).toEqual({ code: "111", qty: 2 });
  });
  it("reads '111=2' as two units", () => {
    expect(parseProductRequest("111=2")).toEqual({ code: "111", qty: 2 });
  });
  it("reads a Latin product code followed by a Burmese unit", () => {
    expect(parseProductRequest("iPhone 1လုံး")).toEqual({ code: "iPhone", qty: 1 });
    expect(parseProductRequest("iphone=2ခု")).toEqual({ code: "iphone", qty: 2 });
  });
  it("reads Myanmar and Thai digits as quantities without changing the product code", () => {
    expect(parseProductRequest("ဖိနပ်-၁ ၂ခု")).toEqual({ code: "ဖိနပ်-၁", qty: 2 });
    expect(parseProductRequest("รองเท้า_02 ๓ခု")).toEqual({ code: "รองเท้า_02", qty: 3 });
  });
  it("reads product codes written in Burmese and Thai", () => {
    expect(parseProductRequest("ဖိနပ်-၁ 2")).toEqual({ code: "ဖိနပ်-၁", qty: 2 });
    expect(parseProductRequest("รองเท้า_02")).toEqual({ code: "รองเท้า_02", qty: null });
  });
  it("normalizes canonically equivalent Unicode codes", () => {
    expect(parseProductRequest("cafe\u0301")).toEqual({ code: "café", qty: null });
  });
  it("rejects zero quantity", () => {
    expect(parseProductRequest("111=0")).toBeNull();
  });
});

describe("usernameToEmail", () => {
  it("normalizes usernames", () => {
    expect(usernameToEmail(" Admin ")).toBe("admin@shop-admin.local");
  });
});
