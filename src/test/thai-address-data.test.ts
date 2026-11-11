// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ThaiAddressData } from "@/lib/thai-provinces";

const dataset = JSON.parse(
  readFileSync(new URL("../../public/data/thai-addresses.json", import.meta.url), "utf8"),
) as ThaiAddressData;

describe("Thai address lookup dataset", () => {
  it("contains all districts and subdistricts from the referenced national dataset", () => {
    expect(dataset.revision).toBe("2026-08-06");
    expect(dataset.districts).toHaveLength(928);
    expect(dataset.subdistricts).toHaveLength(7436);
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

  it("contains all 18 Mueang Samut Sakhon subdistricts with postal codes", () => {
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
});
