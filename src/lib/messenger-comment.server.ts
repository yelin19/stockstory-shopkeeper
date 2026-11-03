import { parseProductRequest } from "@/lib/messenger-parse";

export const maskFacebookId = (id: string) => `***${id.trim().slice(-4)}`;
export const webhookLog = (event: string, details: Record<string, unknown> = {}) => console.info(`[shop-messenger] ${event}`, details);
export type CommentChange = { field: string; value?: { item?: string; verb?: string; comment_id?: string; from?: { id?: string }; message?: string } };
type Dependencies = {
  findActiveProduct: (code: string) => Promise<boolean>;
  claim: (commentId: string) => Promise<boolean>;
  privateReply: (commentId: string, message: string) => Promise<boolean>;
  complete: (commentId: string, status: string, pending: { commenterId: string; code: string; qty: number | null }) => Promise<void>;
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
  // Ask naturally for customer details; the product code and quantity are already saved.
  const quantityText = request.qty === null ? "" : ` ${request.qty} ခု`;
  const success = await deps.privateReply(
    value.comment_id,
    `ဟုတ်ကဲ့ရှင်။ ${request.code} ပစ္စည်း${quantityText} အော်ဒါတင်ပေးပါမယ်ရှင်။\n\nအမည်၊ ဖုန်းနံပါတ်နဲ့ ပို့ရမယ့်လိပ်စာကို Messenger မှာ ပို့ပေးပါရှင်။`,
  );
  webhookLog(success ? "private reply success" : "private reply failure", { commentId: maskFacebookId(value.comment_id) });
  await deps.complete(value.comment_id, success ? "awaiting_messenger_reply" : "private_reply_failed", {
    commenterId: value.from.id,
    code: request.code,
    qty: request.qty,
  });
  // handleText is resumed only by a genuine messaging event with a PSID.
  // Calling it here with from.id risks sending to the wrong ID and violates Meta's response window.
}
// Masks long digit runs (Facebook IDs) and trims Meta error text so logs never carry full IDs.
const safeMetaText = (value: unknown) =>
  typeof value === "string" ? value.replace(/\d{5,}/g, (digits) => `***${digits.slice(-4)}`).slice(0, 300) : undefined;
const safeMetaNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

// Meta official Private Replies format (Messenger Platform):
// POST https://graph.facebook.com/{version}/{PAGE_ID}/messages
// body: { recipient: { comment_id }, message: { text } } with a Page access token.
// The legacy /{comment_id}/private_replies edge is deprecated and returns HTTP 400.
export const GRAPH_API_VERSION = "v21.0";
export async function sendPrivateReply(
  pageId: string,
  commentId: string,
  messageText: string,
  token: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  webhookLog("private reply token check", { tokenPresent: Boolean(token), tokenLength: token?.length ?? 0 });
  if (!token) return false;
  const endpoint = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(pageId.trim())}/messages`;
  webhookLog("private reply request", { apiVersion: GRAPH_API_VERSION, endpoint: "/{page_id}/messages", pageId: maskFacebookId(pageId), commentId: maskFacebookId(commentId) });
  let res: Response;
  try {
    res = await fetcher(`${endpoint}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: messageText } }),
    });
  } catch (error) {
    webhookLog("private reply network failure", { error: safeMetaText((error as Error)?.message) });
    return false;
  }
  if (res.ok) return true;
  let metaError: Record<string, unknown> = {};
  try {
    const body = (await res.json()) as { error?: Record<string, unknown> };
    if (body && typeof body.error === "object" && body.error) metaError = body.error;
  } catch {
    // Non-JSON body; status alone is logged.
  }
  webhookLog("private reply HTTP failure", {
    status: res.status,
    code: safeMetaNumber(metaError["code"]),
    type: safeMetaText(metaError["type"]),
    subcode: safeMetaNumber(metaError["error_subcode"]),
    message: safeMetaText(metaError["message"]),
  });
  return false;
}
