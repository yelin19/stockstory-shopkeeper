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
  it("rejects zero quantity", () => {
    expect(parseProductRequest("111=0")).toBeNull();
  });
});

describe("usernameToEmail", () => {
  it("normalizes usernames", () => {
    expect(usernameToEmail(" Admin ")).toBe("admin@shop-admin.local");
  });
});
