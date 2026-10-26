export type CustomerDetailsChoice = "reuse" | "new";

export function parseCustomerDetailsChoice(value: string): CustomerDetailsChoice | null {
  const choice = value.trim().toLocaleLowerCase();
  if (
    ["reuse_customer_details", "အဟောင်းသုံးမည်", "yes", "y", "ဟုတ်ကဲ့", "ဟုတ်ပါတယ်"].includes(
      choice,
    )
  ) {
    return "reuse";
  }
  if (["enter_customer_details", "အသစ်ထည့်မည်", "no", "n", "မဟုတ်ပါ"].includes(choice)) {
    return "new";
  }
  return null;
}
