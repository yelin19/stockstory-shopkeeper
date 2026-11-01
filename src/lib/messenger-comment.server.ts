import { parseProductRequest } from "@/lib/messenger-parse";

export const maskFacebookId = (id: string) => `***${id.trim().slice(-4)}`;
export const webhookLog = (event: string, details: Record<string, unknown> = {}) => console.info(`[shop-messenger] ${event}`, details);
export type CommentChange = { field: string; value?: { item?: string; verb?: string; comment_id?: string; from?: { id?: string }; message?: string } };
type Dependencies = {
  findActiveProduct: (code: string) => Promise<boolean>;
  claim: (commentId: string) => Promise<boolean>;
  privateReply: (commentId: string, message: string) => Promise<boolean>;
  complete: (commentId: string, status: string) => Promise<void>;
};

// Only feed/item=comment is verified. No guessed Live-specific field.
export async function handleProductComment(change: CommentChange, pageId: string, deps: Dependencies) {
  const value = change.value;
  const safeValue = (value: string | undefined) => value && /^[a-z_]{1,32}$/.test(value) ? value : "unknown";
  webhookLog("change received", { field: safeValue(change.field), item: safeValue(value?.item), verb: safeValue(value?.verb) });
  const reject = (reason: string) => webhookLog("comment rejected", { reason });
  if (change.field !== "feed") return reject("unsupported_unverified_field");
  if (value?.item !== "comment" || value.verb !== "add") return reject("not_added_comment");
  if (!value.comment_id || !/^\d{1,32}(?:_\d{1,32})?$/.test(value.comment_id)) return reject("missing_or_invalid_comment_id");
  if (!value.from?.id || !/^\d{1,32}$/.test(value.from.id)) return reject("missing_or_invalid_sender");
  if (value.from.id.trim() === pageId.trim()) return reject("page_self_comment");
  const message = value.message?.trim();
  if (!message) return reject("missing_message");
  const request = parseProductRequest(message);
  if (!request) return reject("invalid_product_code");
  if (!(await deps.findActiveProduct(request.code))) return reject("no_active_product");
  webhookLog("product code accepted", { hasQuantity: request.qty !== null });
  if (!(await deps.claim(value.comment_id))) return reject("duplicate_comment");
  // A private reply does not open the ordinary Messenger response window.
  // Ask for a customer reply; never treat feed from.id as a Messenger PSID.
  const success = await deps.privateReply(value.comment_id, `ဒီပစ္စည်းကို မှာယူရန် Messenger မှာ ${request.code}${request.qty === null ? "" : `=${request.qty}`} လို့ ပြန်ပို့ပေးပါရှင်။`);
  webhookLog(success ? "private reply success" : "private reply failure", { commentId: maskFacebookId(value.comment_id) });
  await deps.complete(value.comment_id, success ? "awaiting_messenger_reply" : "private_reply_failed");
  // handleText is resumed only by a genuine messaging event with a PSID.
  // Calling it here with from.id risks sending to the wrong ID and violates Meta's response window.
}