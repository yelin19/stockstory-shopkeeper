# 100×75 mm label printing

The address-label button renders one label per 100 mm × 75 mm page. The app first tries a local silent-print agent and only falls back to the browser print dialog when no agent is available.

## Silent printing on a desktop browser

1. Install QZ Tray on the computer connected to the label printer.
2. Configure the printer as the default printer, or expose a `window.stockstoryPrintBridge.print(payload)` adapter if the shop uses a custom relay agent.
3. Use the deployed app over HTTPS. Production QZ Tray deployments should configure QZ certificate/signature callbacks rather than relying on unsigned development mode.
4. Select orders and press **လိပ်စာတံဆိပ် ပုံနှိပ်မည်**. With QZ Tray running, the label is sent directly without the browser Print Preview dialog.

The helper sends a self-contained HTML payload with `widthMm: 100` and `heightMm: 75`; QZ Tray selects the default printer and prints with zero margins. Without QZ Tray or a custom bridge, the browser fallback remains available because normal web browsers cannot legally bypass their print dialog.
