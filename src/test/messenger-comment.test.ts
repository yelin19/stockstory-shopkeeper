// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleProductComment, type CommentChange } from "@/lib/messenger-comment.server";

const page = "1435456272977322";
let claimed: Set<string>;
let deps: Parameters<typeof handleProductComment>[2];
const comment = (message = "ABC123", patch = {}): CommentChange => ({ field: "feed", value: { item: "comment", verb: "add", comment_id: "123_456", from: { id: "987654" }, message, ...patch } });
beforeEach(() => {
  claimed = new Set();
  deps = {
    findActiveProduct: vi.fn(async (code) => code === "ABC123" ? { name: "Test Product", price: 100, unit: "ခု", priceText: "100 ကျပ်", totalText: "200 ကျပ်" } : null),
    claim: vi.fn(async (id) => { if (claimed.has(id)) return false; claimed.add(id); return true; }),
    privateReply: vi.fn(async () => true), complete: vi.fn(async () => {}),
  };
});
describe("production comment gates", () => {
  it.each(["ABC123", "ABC123 2", "ABC123=2"])("accepts exact active %s feed comment", async (message) => {
    await handleProductComment(comment(message), page, deps);
    expect(deps.findActiveProduct).toHaveBeenCalledWith("ABC123");
    expect(deps.privateReply).toHaveBeenCalledOnce();
    if (message === "ABC123=2") expect(deps.privateReply).toHaveBeenCalledWith("123_456", expect.stringContaining("ပစ္စည်း: Test Product"));
    if (message === "ABC123=2") expect(deps.privateReply).toHaveBeenCalledWith("123_456", expect.stringContaining("စုစုပေါင်း: 200 ကျပ်"));
    expect(deps.complete).toHaveBeenCalledWith("123_456", "awaiting_messenger_reply", { commenterId: "987654", code: "ABC123", qty: message === "ABC123" ? null : 2 });
  });
  it.each(["good", "nice", "ဘယ်လောက်လဲ", "ABC124", "abc123"])("does not reply to %s without an exact active code", async (message) => {
    await handleProductComment(comment(message), page, deps);
    expect(deps.privateReply).not.toHaveBeenCalled();
    expect(deps.claim).not.toHaveBeenCalled();
  });
  it("rejects invalid code syntax", async () => {
    await handleProductComment(comment("ABC123=0"), page, deps);
    expect(deps.findActiveProduct).not.toHaveBeenCalled();
  });
  it("rejects inactive products", async () => {
    vi.mocked(deps.findActiveProduct).mockResolvedValue(null);
    await handleProductComment(comment(), page, deps);
    expect(deps.privateReply).not.toHaveBeenCalled();
  });
  it.each([{ from: { id: page } }, { comment_id: undefined }, { from: undefined }, { item: "status" }, { verb: "edited" }, { message: undefined }])("rejects incomplete/self/test change %j", async (patch) => {
    await handleProductComment(comment("ABC123", patch), page, deps);
    expect(deps.privateReply).not.toHaveBeenCalled();
  });
  it("deduplicates simultaneous repeated comment IDs", async () => {
    await Promise.all([handleProductComment(comment(), page, deps), handleProductComment(comment(), page, deps)]);
    expect(deps.privateReply).toHaveBeenCalledOnce();
  });
  it("records failure and never opens a Messenger session after private reply failure", async () => {
    vi.mocked(deps.privateReply).mockResolvedValue(false);
    await handleProductComment(comment(), page, deps);
    expect(deps.complete).toHaveBeenCalledWith("123_456", "private_reply_failed", { commenterId: "987654", code: "ABC123", qty: null });
  });
  it("does not assume a live_comments payload; verified Live feed comments use the same feed gate", async () => {
    await handleProductComment({ ...comment(), field: "live_comments" }, page, deps);
    expect(deps.privateReply).not.toHaveBeenCalled();
    await handleProductComment(comment(), page, deps);
    expect(deps.privateReply).toHaveBeenCalledOnce();
  });
});
import { sendPrivateReply } from "@/lib/messenger-comment.server";
describe("sendPrivateReply", () => {
  it("uses Meta Page messages endpoint with recipient.comment_id", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendPrivateReply(page, "123_456", "hi", "tok", f as never)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(`https://graph.facebook.com/v21.0/${page}/messages?`)).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({ recipient: { comment_id: "123_456" }, message: { text: "hi" } });
  });
  it("logs Meta error fields without token", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad 1435456272977322", type: "OAuthException", code: 100, error_subcode: 33 } }), { status: 400 }));
    expect(await sendPrivateReply(page, "123_456", "hi", "secret-token", f as never)).toBe(false);
    const out = JSON.stringify(log.mock.calls);
    expect(out).toContain('"code":100'); expect(out).toContain('"subcode":33'); expect(out).toContain('"status":400');
    expect(out).not.toContain("secret-token"); expect(out).not.toContain("1435456272977322");
    log.mockRestore();
  });
});
