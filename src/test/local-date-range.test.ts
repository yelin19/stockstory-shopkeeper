import { describe, expect, it } from "vitest";
import { localInclusiveDateRange } from "@/lib/local-date-range";

function localCalendarDate(value: string) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

describe("localInclusiveDateRange", () => {
  it("includes the full selected end date using a half-open range", () => {
    const range = localInclusiveDateRange("2026-10-01", "2026-10-31");
    expect(range).not.toBeNull();
    expect(localCalendarDate(range!.start_at)).toBe("2026-10-01");
    expect(localCalendarDate(range!.end_at)).toBe("2026-11-01");
    expect(new Date(range!.start_at).getHours()).toBe(0);
    expect(new Date(range!.end_at).getHours()).toBe(0);
  });

  it("accepts a valid leap-day range", () => {
    expect(localInclusiveDateRange("2024-02-29", "2024-02-29")).not.toBeNull();
  });

  it("rejects impossible calendar dates and malformed values", () => {
    expect(localInclusiveDateRange("2026-02-30", "2026-03-01")).toBeNull();
    expect(localInclusiveDateRange("not-a-date", "2026-03-01")).toBeNull();
  });

  it("rejects a start date later than the end date", () => {
    expect(localInclusiveDateRange("2026-10-02", "2026-10-01")).toBeNull();
  });
});
