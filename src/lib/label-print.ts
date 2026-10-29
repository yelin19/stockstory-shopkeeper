export const LABEL_WIDTH_MM = 100;
export const LABEL_HEIGHT_MM = 75;

type LabelPrintPayload = {
  html: string;
  widthMm: number;
  heightMm: number;
};

type StockStoryPrintBridge = {
  print: (payload: LabelPrintPayload) => void | Promise<void>;
};

type QzApi = {
  websocket: {
    isActive?: () => boolean;
    connect: () => Promise<void>;
  };
  printers: {
    find: () => Promise<string>;
  };
  configs: {
    create: (printer: string, options: Record<string, unknown>) => unknown;
  };
  print: (config: unknown, data: Array<Record<string, unknown>>) => Promise<void>;
};

declare global {
  interface Window {
    stockstoryPrintBridge?: StockStoryPrintBridge;
    qz?: QzApi;
  }
}

const LABEL_STYLES = `
  @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
  html, body { width: ${LABEL_WIDTH_MM}mm; height: ${LABEL_HEIGHT_MM}mm; margin: 0; padding: 0; }
  * { box-sizing: border-box; }
  .thermal-label-page {
    display: flex;
    flex-direction: column;
    gap: 2mm;
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    min-height: ${LABEL_HEIGHT_MM}mm;
    max-height: ${LABEL_HEIGHT_MM}mm;
    overflow: hidden;
    padding: 4mm;
    color: #000;
    background: #fff;
    border: 0.25mm solid #333;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.2;
    page-break-after: always;
    break-after: page;
  }
  .thermal-label-page:last-child { page-break-after: auto; break-after: auto; }
  .thermal-label-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 0.4mm solid #000;
    padding-bottom: 1mm;
    font-size: 10pt;
    font-weight: 700;
  }
  .thermal-label-heading strong { font-size: 16pt; }
  .thermal-label-sender {
    min-height: 15mm;
    overflow-wrap: anywhere;
    font-size: 9pt;
    line-height: 1.15;
  }
  .thermal-label-sender strong { display: block; font-size: 11pt; }
  .thermal-label-section-title { margin-bottom: 0.5mm; font-size: 8pt; font-weight: 700; }
  .thermal-label-divider { flex: 0 0 0.35mm; width: 100%; background: #000; }
  .thermal-label-recipient-block { min-height: 31mm; }
  .thermal-label-recipient { font-size: 15pt; font-weight: 800; }
  .thermal-label-phone { font-size: 12pt; font-weight: 700; }
  .thermal-label-address { overflow-wrap: anywhere; font-size: 11pt; }
  .thermal-label-address strong { display: block; font-size: 9pt; }
  .thermal-label-product {
    margin-top: auto;
    border-top: 0.25mm solid #777;
    padding-top: 1mm;
    font-size: 9pt;
    font-weight: 600;
  }
`;

function wrapLabelHtml(content: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${LABEL_STYLES}</style></head><body>${content}</body></html>`;
}

function getLabelPages(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(".thermal-label-page")];
}

/**
 * Sends labels to an installed local print agent when one is available.
 * QZ Tray receives one complete 100×75 mm page per print item so a batch
 * cannot turn later labels into blank pages.
 */
export async function printLabelsSilently(root: HTMLElement): Promise<boolean> {
  const pages = getLabelPages(root);
  if (!pages.length) return false;
  const pageHtml = pages.map((page) => wrapLabelHtml(page.outerHTML));
  const payload = {
    html: wrapLabelHtml(pages.map((page) => page.outerHTML).join("")),
    widthMm: LABEL_WIDTH_MM,
    heightMm: LABEL_HEIGHT_MM,
  };

  if (window.stockstoryPrintBridge) {
    await window.stockstoryPrintBridge.print(payload);
    return true;
  }

  const qz = window.qz;
  if (!qz) return false;

  if (!qz.websocket.isActive?.()) await qz.websocket.connect();
  const printer = await qz.printers.find();
  const config = qz.configs.create(printer, {
    size: { width: LABEL_WIDTH_MM, height: LABEL_HEIGHT_MM, units: "mm" },
    margins: 0,
    scaleContent: false,
  });
  await qz.print(config, pageHtml.map((data) => ({ type: "pixel", format: "html", flavor: "plain", data })));
  return true;
}
