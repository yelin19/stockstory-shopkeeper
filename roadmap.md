# Messenger webhook
- [ ] Confirm synced commit 792ab7e, verify the owner's Facebook Page ID and shared app/webhook database, redeploy, and check the live endpoint.
- [x] Sync commits d5966b8 (webhook diagnostics) and 813024c (Facebook comment product-code order flow), publish, and verify the live POST endpoint (unsigned/wrong-signature → 401; GET wrong token → 403).
- [x] Confirm commit 8c80e20 is included, fix shipping release errors, and verify the four order actions and tracking gate (signed-in pending save/read-back plus 15 shipping/Messenger tests).
- [x] Check security and request publication of the updated Shop app.
- [x] Harden signed Messenger requests and preserve database-backed order confirmation.
- [x] Test verification and invalid requests live; test confirmed-order flow with a mocked database (12 tests passed).
- [x] Check required Facebook configuration and report activation blockers.
- [ ] Verify a real Messenger order reads back in admin: blocked by missing SHOP_FB_APP_SECRET and SHOP_FB_PAGE_ACCESS_TOKEN, Facebook Page/PIN configuration, and publication of these changes.

# Android thermal label printing
- [x] Research existing label layout and Android silent-print options: BLE/GATT can use Web Bluetooth after permission; Classic Bluetooth/USB requires a compatible Android bridge or vendor app. Existing HTML label requests 100×75 mm but can clip long content.
- [ ] Implement exact 100×75 mm label fit and compatible direct-print transport: waiting for printer model and connection type.
- [ ] Verify real one-click output without print dialog: requires the user's Android device and printer.