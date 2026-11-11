import { describe, expect, it } from "vitest";
import {
  THAI_PROVINCES,
  decodeCartAddressLines,
  encodeCartAddressLines,
  findThaiProvince,
  thaiProvinceLabel,
  thaiProvinceTownship,
} from "@/lib/thai-provinces";

describe("Thai province reference", () => {
  it("lists all 77 provinces with unique codes and abbreviations", () => {
    expect(THAI_PROVINCES).toHaveLength(77);
    expect(new Set(THAI_PROVINCES.map((p) => p.code)).size).toBe(77);
    expect(new Set(THAI_PROVINCES.map((p) => p.abbr)).size).toBe(77);
  });

  it("uses the Ministry of Interior (DOPA) province codes", () => {
    const expected: Record<string, string> = {
      "10": "กรุงเทพมหานคร",
      "14": "พระนครศรีอยุธยา",
      "20": "ชลบุรี",
      "38": "บึงกาฬ",
      "50": "เชียงใหม่",
      "56": "พะเยา",
      "58": "แม่ฮ่องสอน",
      "74": "สมุทรสาคร",
      "81": "กระบี่",
      "83": "ภูเก็ต",
      "86": "ชุมพร",
      "92": "ตรัง",
      "96": "นราธิวาส",
    };
    for (const [code, name] of Object.entries(expected)) {
      expect(findThaiProvince(code)?.name).toBe(name);
    }
  });

  it("keeps the DSD abbreviations from the Ministry-of-Interior table", () => {
    expect(findThaiProvince("กท")?.code).toBe("10");
    expect(findThaiProvince("ชย")?.code).toBe("36");
    expect(findThaiProvince("มส")?.code).toBe("58");
    expect(findThaiProvince("ตง")?.code).toBe("92");
    expect(findThaiProvince("พร")?.code).toBe("54");
  });

  it("finds a province by code, abbreviation, Thai name, English name or alias", () => {
    expect(findThaiProvince("10")?.name).toBe("กรุงเทพมหานคร");
    expect(findThaiProvince("กทม.")?.name).toBe("กรุงเทพมหานคร");
    expect(findThaiProvince("จังหวัดเชียงใหม่")?.code).toBe("50");
    expect(findThaiProvince("Chiang Mai")?.code).toBe("50");
    expect(findThaiProvince("Bangkok")?.code).toBe("10");
    expect(findThaiProvince("โคราช")?.code).toBe("30");
    expect(findThaiProvince("unknown")).toBeNull();
    expect(findThaiProvince(null)).toBeNull();
  });

  it("formats the dropdown label and the stored township", () => {
    const bangkok = findThaiProvince("10")!;
    expect(thaiProvinceLabel(bangkok)).toBe("กรุงเทพมหานคร (กท) · 10");
    expect(thaiProvinceTownship(bangkok)).toBe("กรุงเทพมหานคร (กท)");
  });

  it("encodes and decodes the cart address lines", () => {
    const krabi = findThaiProvince("81")!;
    const lines = encodeCartAddressLines(krabi, "  123/4 หมู่ 5\nต.อ่าวนาง อ.เมือง 81000 ");
    expect(lines).toEqual([
      "ADDR_PROVINCE: 81|กบ|กระบี่",
      "ADDR_DETAIL: 123/4 หมู่ 5 ต.อ่าวนาง อ.เมือง 81000",
    ]);
    const decoded = decodeCartAddressLines(["CART_ORDER", ...lines, "1. Test — 1 ชิ้น [111]"]);
    expect(decoded?.province.code).toBe("81");
    expect(decoded?.detail).toBe("123/4 หมู่ 5 ต.อ่าวนาง อ.เมือง 81000");
  });

  it("does not accept incomplete or unknown addresses", () => {
    expect(decodeCartAddressLines(["ADDR_PROVINCE: 10|กท|กรุงเทพมหานคร"])).toBeNull();
    expect(decodeCartAddressLines(["ADDR_DETAIL: 123 Sukhumvit"])).toBeNull();
    expect(
      decodeCartAddressLines(["ADDR_PROVINCE: 999|xx|ไม่ทราบ", "ADDR_DETAIL: 123 Sukhumvit"]),
    ).toBeNull();
    expect(
      decodeCartAddressLines(["ADDR_PROVINCE: 10|กท|กรุงเทพมหานคร", "ADDR_DETAIL: ab"]),
    ).toBeNull();
    expect(encodeCartAddressLines(findThaiProvince("10")!, "   ")).toEqual([]);
  });
});
