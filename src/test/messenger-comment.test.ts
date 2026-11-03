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
    findActiveProduct: vi.fn(async (code) => code === "ABC123"),
    claim: vi.fn(async (id) => { if (claimed.has(id)) return false; claimed.add(id); return true; }),
    privateReply: vi.fn(async () => true), complete: vi.fn(async () => {}),
  };
});
describe("production comment gates", () => {
  it.each(["ABC123", "ABC123 2", "ABC123=2"])("accepts exact active %s feed comment", async (message) => {
    await handleProductComment(comment(message), page, deps);
    expect(deps.findActiveProduct).toHaveBeenCalledWith("ABC123");
    expect(deps.privateReply).toHaveBeenCalledOnce();
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
    vi.mocked(deps.findActiveProduct).mockResolvedValue(false);
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
