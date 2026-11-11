// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ThaiAddressData } from "@/lib/thai-provinces";

const dataset = JSON.parse(
  readFileSync(new URL("../../public/data/thai-addresses.json", import.meta.url), "utf8"),
) as ThaiAddressData;
const exceptions = JSON.parse(
  readFileSync(
    new URL("../../public/data/thai-postal-code-exceptions.json", import.meta.url),
    "utf8",
  ),
) as {
  count: number;
  subdistricts: Array<{ subdistrictCode: string; sourceLines: string[] }>;
};

describe("Thai address lookup dataset", () => {
  it("contains every province-level, district, and subdistrict record in the reviewed release", () => {
    expect(dataset.revision).toBe("thailand-geography-json@v1.3.0 (2026-10-28)");
    expect(dataset.provinces).toHaveLength(77);
    expect(new Set(dataset.provinces.map((item) => item.code)).size).toBe(77);
    expect(dataset.districts).toHaveLength(928);
    expect(dataset.subdistricts).toHaveLength(7436);
    expect(new Set(dataset.districts.map((item) => item.code)).size).toBe(928);
    expect(new Set(dataset.subdistricts.map((item) => item.code)).size).toBe(7436);
  });

  it("has no broken parent links, malformed codes, or missing postcode options", () => {
    const provinces = new Set(dataset.provinces.map((item) => item.code));
    const districts = new Map(dataset.districts.map((item) => [item.code, item]));
    expect(dataset.districts.every((item) => provinces.has(item.provinceCode))).toBe(true);
    expect(
      dataset.subdistricts.every((item) => {
        const parent = districts.get(item.districtCode);
        return Boolean(
          parent &&
          parent.provinceCode === item.provinceCode &&
          item.postalCodes.length > 0 &&
          item.postalCodes.every((option) => /^\d{5}$/.test(option.postalCode)) &&
          item.postalCodes.filter((option) => option.isPrimary).length === 1 &&
          item.postalCodes[0]?.postalCode === item.postalCode,
        );
      }),
    ).toBe(true);
    expect(dataset.districts.every((item) => /^\d{5}$/.test(item.postalCode))).toBe(true);
  });

  it("contains all 50 current Bangkok districts and their subdistrict relations", () => {
    const bangkokDistricts = dataset.districts.filter((item) => item.provinceCode === "10");
    expect(bangkokDistricts).toHaveLength(50);
    expect(bangkokDistricts.find((item) => item.code === "1001")?.nameTh).toBe("พระนคร");
    expect(bangkokDistricts.find((item) => item.code === "1027")?.nameTh).toBe("บึงกุ่ม");
    expect(
      dataset.subdistricts.some(
        (item) => item.provinceCode === "10" && item.districtCode === "1001",
      ),
    ).toBe(true);
  });

  it("contains all 18 Mueang Samut Sakhon subdistricts with valid postcode choices", () => {
    const district = dataset.districts.find((item) => item.code === "7401");
    const subdistricts = dataset.subdistricts.filter((item) => item.districtCode === "7401");
    expect(district).toMatchObject({
      provinceCode: "74",
      code: "7401",
      nameTh: "เมืองสมุทรสาคร",
      postalCode: "74000",
    });
    expect(subdistricts).toHaveLength(18);
    expect(subdistricts.find((item) => item.code === "740101")).toMatchObject({
      nameTh: "มหาชัย",
      postalCode: "74000",
    });
    expect(subdistricts.every((item) => /^\d{5}$/.test(item.postalCode))).toBe(true);
  });

  it("includes every upstream multiple-postcode exception and its locality details", () => {
    const multiple = dataset.subdistricts.filter((item) => item.postalCodes.length > 1);
    expect(exceptions.count).toBe(86);
    expect(exceptions.subdistricts).toHaveLength(86);
    expect(multiple).toHaveLength(86);
    expect(multiple.filter((item) => item.postalCodes.length === 2)).toHaveLength(83);
    expect(multiple.filter((item) => item.postalCodes.length === 3)).toHaveLength(3);
    expect(new Set(exceptions.subdistricts.map((item) => item.subdistrictCode)).size).toBe(86);
    expect(
      exceptions.subdistricts.every((item) =>
        item.sourceLines.some((line) => line.trim().length > 0),
      ),
    ).toBe(true);
  });

  it("offers Ao Nang's distinct postal codes for Moo 1-6 and Moo 7-8", () => {
    const aoNang = dataset.subdistricts.find((item) => item.code === "810116");
    expect(aoNang?.postalCodes).toEqual([
      expect.objectContaining({ postalCode: "81180", isPrimary: true, detailTh: "ม.1 - 6" }),
      expect.objectContaining({ postalCode: "81210", isPrimary: false, detailTh: "ม.7 - 8" }),
    ]);
  });

  it("uses Thailand Post's corrected 43230 code in all five Fao Rai tambons", () => {
    const faoRai = dataset.subdistricts.filter((item) => item.districtCode === "4315");
    const changed = new Set(["เฝ้าไร่", "นาดี", "หนองหลวง", "วังหลวง", "อุดมพร"]);
    const affected = faoRai.filter((item) => changed.has(item.nameTh));
    expect(affected).toHaveLength(5);
    expect(affected.every((item) => item.postalCode === "43230")).toBe(true);
  });
});
