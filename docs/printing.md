# 100×75 mm label printing

The address-label button renders one label per 100 mm × 75 mm page. Each label shows the shop's sender name/address at the top, a divider line, and the customer's recipient name/address below it. The app first tries a local silent-print agent and only falls back to the browser print dialog when no agent is available.

Set the sender address under **ဆက်တင်များ → ပို့သူလိပ်စာ**. Apply database migration `0018_sender_address.sql` before saving this new field.

## Silent printing on a desktop browser

1. Install QZ Tray on the computer connected to the label printer.
2. Configure the label printer as the computer's default printer, or expose a `window.stockstoryPrintBridge.print(payload)` adapter if the shop uses a custom relay agent.
3. Use the deployed app over HTTPS. Production QZ Tray deployments should configure QZ certificate/signature callbacks rather than relying on unsigned development mode.
4. Select orders and press **လိပ်စာတံဆိပ် ပုံနှိပ်မည်**. With QZ Tray running, the label is sent directly without the browser Print Preview dialog or a manual paper-size selection.

The helper sends a self-contained HTML payload with `widthMm: 100` and `heightMm: 75`; QZ Tray selects the default printer and prints with zero margins. Without QZ Tray or a custom bridge, the browser fallback remains available because normal web browsers cannot legally bypass their print dialog.

The browser fallback cannot force the printer's paper size. If QZ Tray is not connected, the app intentionally opens the browser print dialog and shows a notice; install/restart QZ Tray on the printer computer to get fully automatic 100×75 mm printing.
