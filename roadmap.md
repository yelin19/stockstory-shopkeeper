# Messenger webhook
- [x] Confirm commit 8c80e20 is included, fix shipping release errors, and verify the four order actions and tracking gate (signed-in pending save/read-back plus 15 shipping/Messenger tests).
- [x] Check security and request publication of the updated Shop app.
- [x] Harden signed Messenger requests and preserve database-backed order confirmation.
- [x] Test verification and invalid requests live; test confirmed-order flow with a mocked database (12 tests passed).
- [x] Check required Facebook configuration and report activation blockers.
- [ ] Verify a real Messenger order reads back in admin: blocked by missing SHOP_FB_APP_SECRET and SHOP_FB_PAGE_ACCESS_TOKEN, Facebook Page/PIN configuration, and publication of these changes.

# Android thermal label printing
- [ ] Research existing label layout and Android silent-print options.
- [ ] Implement exact 100×75 mm label fit and compatible direct-print transport: waiting for printer model and connection type.
- [ ] Verify real one-click output without print dialog: requires the user's Android device and printer.