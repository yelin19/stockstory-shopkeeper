<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Shop admin login uses username + password; usernames map to synthetic `<username>@shop-admin.local` emails (auto-confirm on) — no email is collected.
- Every shop table is scoped by `owner_id = auth.uid()` RLS; stock changes only via DB functions (`change_stock`, `cancel_order`, `place_order`) so history is always written and stock can't go negative.
- `place_order` and `verify_shop_pin` are service-role only, called from the Messenger webhook at `/api/public/shop-messenger` (signature-verified). Webhook picks the shop by Facebook Page ID from `shop_settings.fb_page_id`.
- Product images live in a private bucket and are served through `/api/public/product-image/$code` so Facebook/OG can fetch them (public buckets are blocked in this workspace).
