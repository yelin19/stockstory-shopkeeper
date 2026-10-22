import { z } from "zod";

const facebookId = z.string().regex(/^\d{1,32}$/);
const eventSchema = z.object({
  sender: z.object({ id: facebookId }),
  message: z.object({
    text: z.string().max(1000).optional(),
    is_echo: z.boolean().optional(),
  }).passthrough().optional(),
  postback: z.object({ payload: z.string().max(1000).optional() }).passthrough().optional(),
}).passthrough();

export const messengerPayloadSchema = z.object({
  object: z.literal("page"),
  entry: z.array(z.object({
    id: facebookId,
    messaging: z.array(eventSchema).max(1000).optional(),
  }).passthrough()).max(1000),
}).passthrough();

export const messengerVerificationSchema = z.object({
  mode: z.literal("subscribe"),
  token: z.string().min(1).max(256),
  challenge: z.string().min(1).max(1024),
});

export async function verifyMessengerSignature(body: string, header: string | null, secret: string | undefined) {
  if (!secret || !header || !/^sha256=[a-f0-9]{64}$/.test(header)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  const expected = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  const supplied = header.slice(7);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return difference === 0;
}