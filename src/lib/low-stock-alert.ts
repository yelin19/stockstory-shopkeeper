export function parseLowStockPairPin(message: string, allowBarePin = false): string | null {
  const normalized = message.trim();
  const prefixedPin = normalized.match(/^PIN\s+([0-9]{6,8})$/i)?.[1];
  if (prefixedPin) return prefixedPin;
  return allowBarePin ? normalized.match(/^([0-9]{6,8})$/)?.[1] ?? null : null;
}

export function formatLowStockAlertMessage(alert: {
  product_code: string;
  product_name: string;
  stock: number;
  threshold: number;
  unit?: string | null;
}) {
  const unit = alert.unit?.trim() || "ခု";
  return `⚠️ လက်ကျန်နည်းနေပါပြီ\nပစ္စည်း: ${alert.product_name} (${alert.product_code})\nလက်ကျန်: ${alert.stock}${unit}\nသတိပေးအရေအတွက်: ${alert.threshold}${unit}`;
}

export function lowStockPairingConfirmation() {
  return "✅ အတည်ပြုပါသည်။ ဒီ Messenger အကောင့်ကို ဆိုင်၏ လက်ကျန်နည်းသတိပေးစာ လက်ခံမည့်အကောင့်အဖြစ် ချိတ်ဆက်ပြီးပါပြီ။ လက်ကျန်က သတ်မှတ်ထားသော အရေအတွက်သို့မဟုတ် အောက်ရောက်ပါက ဒီအကောင့်သို့ သတိပေးစာပို့ပါမည်။ အကောင့်ပြောင်းရန် ဆက်တင်များနှင့် Messenger ထဲတွင် PIN အသစ်သတ်မှတ်ပါ။";
}
