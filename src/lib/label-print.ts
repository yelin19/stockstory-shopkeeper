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

function getLabelHtml(root: HTMLElement) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
    html, body { width: ${LABEL_WIDTH_MM}mm; height: ${LABEL_HEIGHT_MM}mm; margin: 0; padding: 0; }
    * { box-sizing: border-box; }
  </style></head><body>${root.innerHTML}</body></html>`;
}

/**
 * Sends labels to an installed local print agent when one is available.
 * QZ Tray is optional so the web app remains usable without a native agent.
 */
export async function printLabelsSilently(root: HTMLElement): Promise<boolean> {
  const payload = {
    html: getLabelHtml(root),
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
  await qz.print(config, [{ type: "pixel", format: "html", flavor: "plain", data: payload.html }]);
  return true;
}
