# Facebook comment release check — 2026-11-01

## Verified
- Public GitHub main was `e4ae99c58b2e56cd814246cdd811d3cbb09e86c2`, matching local main/origin/main before edits. No manual pull was needed or performed.
- Configured owner row and Page token both identify Page `1435456272977322`.
- Exact active product checks run before private replies; comment receipts are claimed atomically in service-only `messenger_sessions` with `comment:` namespace.
- HMAC remains required. Logs omit comment text, customer data and credentials; IDs are masked.
- `feed` + `item=comment` + `verb=add` is supported. A guessed `live_comments` field was removed.
- The existing Messenger order logic is preserved. Orders are created only through the existing confirmation RPCs.

## Intentional limitation
A Page feed `from.id` is not assumed to be a Messenger PSID. A private reply does not itself open the ordinary Messenger response window. The private reply asks the customer to send the code in Messenger; the subsequent genuine messaging event resumes `handleText()`. Immediate `handleText()` execution after the private reply is not implemented, because its sends could use the wrong identifier and a closed messaging window.

## Meta checks requiring Page/app administration
The token's `me` lookup succeeded. Page `subscribed_apps` returned HTTP 403 / Meta code 200, and Page feed read returned HTTP 400 / code 10. These do not prove subscriptions or permissions are absent; they mean inspection with the configured token was denied.

1. Meta for Developers → My Apps → select the app → confirm App Mode is Live (UI location varies).
2. App Dashboard → Webhooks → Page → verify callback `https://stockstory-shopkeeper.lovable.app/api/public/shop-messenger` and app-level `feed`/`messages` fields. A Feed Test is not a real comment test.
3. Messenger API Settings → connected Facebook Pages → select Page `1435456272977322` → inspect webhook subscriptions. Both app-level and Page-level subscriptions must include the required fields.
4. App Review → Permissions and Features → inspect `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_messaging`; also check `pages_show_list` for listing/subscription inspection. Check access levels, required review and Page tasks for the exact app/use case. Advanced Access or business verification requirements are not established by this release.
5. App Settings → Basic → use the current App Secret to update the shop secret securely if needed. Its equality cannot be reported or exposed; valid production Meta signatures are the operational proof.
6. App Settings / Business Verification and App Review → confirm any requirements Meta displays. The app cannot change those Dashboard settings.
7. Create/identify a real active `ABC123` product, then have a customer comment `ABC123`, `ABC123 2` or `ABC123=2` on a real Page post. Record the time. Check production logs for POST → signature accepted → payload parsed → Page matched → feed/comment/add → product accepted → private reply success. Then reply in Messenger and verify handleText started/completed and the existing order confirmation.
8. Repeat during a real Live broadcast. Record actual field/item/verb; do not claim Live support until that actual webhook is observed. Unsupported fields log a rejection rather than silently guessing their schema.

## Database migration note
An additive receipt-table migration was attempted but blocked by a pre-existing low-stock function return-type mismatch. No schema change was applied. Persistent receipt claims use the existing service-only session table instead; no existing migration/function was disabled.

## References
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages/
- https://developers.facebook.com/docs/graph-api/webhooks/reference/page/
- https://developers.facebook.com/docs/messenger-platform/discovery/private-replies/
- https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/