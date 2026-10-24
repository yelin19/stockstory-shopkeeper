export function parseLowStockPairPin(message: string): string | null {
  return message.trim().match(/^PIN\s+([0-9]{6,8})$/i)?.[1] ?? null;
}

export function formatLowStockAlertMessage(alert: {
  product_code: string;
  product_name: string;
  stock: number;
  threshold: number;
}) {
  return `⚠️ လက်ကျန်နည်းနေပါပြီ\nပစ္စည်း: ${alert.product_name} (${alert.product_code})\nလက်ကျန်: ${alert.stock} ခု\nသတိပေးအရေအတွက်: ${alert.threshold} ခု`;
}
