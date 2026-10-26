import { describe, expect, it } from "vitest";
import { parseCustomerDetailsChoice } from "@/lib/customer-details-choice";

describe("returning customer details choice", () => {
  it("recognizes the Burmese reuse quick reply and affirmative replies", () => {
    expect(parseCustomerDetailsChoice("REUSE_CUSTOMER_DETAILS")).toBe("reuse");
    expect(parseCustomerDetailsChoice("အဟောင်းသုံးမည်")).toBe("reuse");
    expect(parseCustomerDetailsChoice("ဟုတ်ကဲ့")).toBe("reuse");
    expect(parseCustomerDetailsChoice("YES")).toBe("reuse");
  });

  it("recognizes the Burmese new-details quick reply and negative replies", () => {
    expect(parseCustomerDetailsChoice("ENTER_CUSTOMER_DETAILS")).toBe("new");
    expect(parseCustomerDetailsChoice("အသစ်ထည့်မည်")).toBe("new");
    expect(parseCustomerDetailsChoice("မဟုတ်ပါ")).toBe("new");
    expect(parseCustomerDetailsChoice("NO")).toBe("new");
  });

  it("returns null for unrelated messages", () => {
    expect(parseCustomerDetailsChoice("111 2")).toBeNull();
  });
});
