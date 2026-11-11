import { describe, expect, it } from "vitest";
import {
  THAI_PROVINCES,
  decodeCartAddressLines,
  encodeCartAddressLines,
  findThaiProvince,
  thaiProvinceLabel,
  thaiProvinceTownship,
  type ThaiDistrict,
  type ThaiSubdistrict,
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

  it("encodes the complete province, district, subdistrict, and postal code", () => {
    const province = findThaiProvince("74")!;
    const district: ThaiDistrict = {
      provinceCode: "74",
      code: "7401",
      nameTh: "เมืองสมุทรสาคร",
      nameEn: "Mueang Samut Sakhon",
      postalCode: "74000",
    };
    const subdistrict: ThaiSubdistrict = {
      provinceCode: "74",
      districtCode: "7401",
      code: "740101",
      nameTh: "มหาชัย",
      nameEn: "Mahachai",
      postalCode: "74000",
      postalCodes: [
        {
          postalCode: "74000",
          isPrimary: true,
          detailTh: "ทั้งตำบล",
          detailEn: "Whole subdistrict",
        },
      ],
    };
    const lines = encodeCartAddressLines(province, "123/4 หมู่ 5", district, subdistrict);
    expect(lines).toEqual([
      "ADDR_PROVINCE: 74|สค|สมุทรสาคร",
      "ADDR_DISTRICT: 7401|เมืองสมุทรสาคร",
      "ADDR_SUBDISTRICT: 740101|มหาชัย|74000",
      "ADDR_DETAIL: 123/4 หมู่ 5",
    ]);
    expect(decodeCartAddressLines(lines)).toMatchObject({
      province: { code: "74", name: "สมุทรสาคร" },
      district: { code: "7401", name: "เมืองสมุทรสาคร" },
      subdistrict: { code: "740101", name: "มหาชัย" },
      postalCode: "74000",
      detail: "123/4 หมู่ 5",
    });
  });

  it("encodes and decodes a non-primary village-specific postcode choice", () => {
    const province = findThaiProvince("81")!;
    const district: ThaiDistrict = {
      provinceCode: "81",
      code: "8101",
      nameTh: "เมืองกระบี่",
      nameEn: "Mueang Krabi",
      postalCode: "81000",
    };
    const subdistrict: ThaiSubdistrict = {
      provinceCode: "81",
      districtCode: "8101",
      code: "810116",
      nameTh: "อ่าวนาง",
      nameEn: "Ao Nang",
      postalCode: "81180",
      postalCodes: [
        { postalCode: "81180", isPrimary: true, detailTh: "ม.1 - 6", detailEn: "Moo 1 - 6" },
        { postalCode: "81210", isPrimary: false, detailTh: "ม.7 - 8", detailEn: "Moo 7 - 8" },
      ],
    };
    const lines = encodeCartAddressLines(
      province,
      "123/4 หมู่ 7",
      district,
      subdistrict,
      "81210",
      "ม.7 - 8",
    );
    expect(lines[2]).toContain("|81210|");
    expect(decodeCartAddressLines(lines)).toMatchObject({
      postalCode: "81210",
      postalCodeDetail: "ม.7 - 8",
    });
    expect(encodeCartAddressLines(province, "123/4", district, subdistrict, "99999")).toEqual([]);
  });

  it("rejects mismatched district and subdistrict selections", () => {
    const province = findThaiProvince("74")!;
    const district: ThaiDistrict = {
      provinceCode: "74",
      code: "7401",
      nameTh: "เมืองสมุทรสาคร",
      nameEn: "Mueang Samut Sakhon",
      postalCode: "74000",
    };
    const subdistrict: ThaiSubdistrict = {
      provinceCode: "74",
      districtCode: "7402",
      code: "740201",
      nameTh: "ตลาดกระทุ่มแบน",
      nameEn: "Talat Krathum Baen",
      postalCode: "74110",
      postalCodes: [
        {
          postalCode: "74110",
          isPrimary: true,
          detailTh: "ทั้งตำบล",
          detailEn: "Whole subdistrict",
        },
      ],
    };
    expect(encodeCartAddressLines(province, "123/4", district, subdistrict)).toEqual([]);
    expect(
      decodeCartAddressLines([
        "ADDR_PROVINCE: 74|สค|สมุทรสาคร",
        "ADDR_DISTRICT: 7401|เมืองสมุทรสาคร",
        "ADDR_SUBDISTRICT: 740201|ตลาดกระทุ่มแบน|74110",
        "ADDR_DETAIL: 123/4",
      ]),
    ).toBeNull();
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
