# Messenger webhook
- [x] Harden signed Messenger requests and preserve database-backed order confirmation.
- [x] Test verification and invalid requests live; test confirmed-order flow with a mocked database (12 tests passed).
- [x] Check required Facebook configuration and report activation blockers.
- [ ] Verify a real Messenger order reads back in admin: blocked by missing SHOP_FB_APP_SECRET and SHOP_FB_PAGE_ACCESS_TOKEN, Facebook Page/PIN configuration, and publication of these changes.