import type { ScanResult } from '../core/types.js';

export type ScanSurface = 'awb' | 'local-pdf';

export interface ScanViewModel {
  statusText: string;
  summaryLines: string[];
  warningLines: string[];
  showAcknowledgement: boolean;
  canDownload: boolean;
  downloadLabel: 'Download CSV' | 'Download partial result';
}

const ELEMENT_IDS = {
  status: 'status',
  summary: 'summary-list',
  warnings: 'warnings-list',
  acknowledgementLabel: 'partial-acknowledgement-label',
  acknowledgement: 'partial-acknowledgement',
  download: 'download-button',
} as const;

export const scanResultElementIds = ELEMENT_IDS;

function summaryLines(result: ScanResult): string[] {
  return [
    `Labels inspected: ${result.labelsInspected}`,
    `Product rows: ${result.rowsDetected}`,
    `Unique SKUs: ${result.uniqueSkus}`,
    `Total quantity: ${result.totalQuantity}`,
  ];
}

function warningLine(message: string, labelIndex: number | undefined): string {
  return labelIndex === undefined
    ? message
    : `${message} (Label ${labelIndex})`;
}

function readyStatusText(surface: ScanSurface): string {
  return surface === 'awb'
    ? 'Ready to scan.'
    : 'Choose a downloaded Shopee AWB PDF.';
}

function unsupportedStatusText(surface: ScanSurface): string {
  return surface === 'awb'
    ? 'Open an AWB route to scan.'
    : 'No supported product table was found in the downloaded Shopee AWB PDF.';
}

export function deriveScanViewModel(
  result: ScanResult | null,
  partialAcknowledged: boolean,
  surface: ScanSurface,
): ScanViewModel {
  if (result === null) {
    return {
      statusText: readyStatusText(surface),
      summaryLines: [],
      warningLines: [],
      showAcknowledgement: false,
      canDownload: false,
      downloadLabel: 'Download CSV',
    };
  }

  const warnings = result.warnings.map((item) =>
    warningLine(item.message, item.labelIndex),
  );

  switch (result.status) {
    case 'complete':
      return {
        statusText: 'Scan complete.',
        summaryLines: summaryLines(result),
        warningLines: warnings,
        showAcknowledgement: false,
        canDownload: true,
        downloadLabel: 'Download CSV',
      };
    case 'partial':
      return {
        statusText: 'Review and acknowledge every warning before downloading.',
        summaryLines: summaryLines(result),
        warningLines: warnings,
        showAcknowledgement: true,
        canDownload: partialAcknowledged,
        downloadLabel: 'Download partial result',
      };
    case 'empty':
      return {
        statusText: 'No product rows found. Verify the print document.',
        summaryLines: summaryLines(result),
        warningLines: warnings,
        showAcknowledgement: false,
        canDownload: false,
        downloadLabel: 'Download CSV',
      };
    case 'inaccessible':
      return {
        statusText:
          'Could not read the source. Wait and retry, or report viewer access.',
        summaryLines: summaryLines(result),
        warningLines: warnings,
        showAcknowledgement: false,
        canDownload: false,
        downloadLabel: 'Download CSV',
      };
    case 'unsupported':
      return {
        statusText: unsupportedStatusText(surface),
        summaryLines: summaryLines(result),
        warningLines: warnings,
        showAcknowledgement: false,
        canDownload: false,
        downloadLabel: 'Download CSV',
      };
  }
}

function replaceListContents(
  list: HTMLElement,
  lines: readonly string[],
): void {
  while (list.firstChild !== null) {
    list.removeChild(list.firstChild);
  }

  for (const line of lines) {
    const item = list.ownerDocument.createElement('li');
    item.textContent = line;
    list.appendChild(item);
  }
}

function requiredElement<T extends HTMLElement>(root: Document, id: string): T {
  const element = root.getElementById(id);
  if (!(element instanceof root.defaultView!.HTMLElement)) {
    throw new Error('Popup shell is missing a required control.');
  }
  return element as T;
}

export function renderScanView(model: ScanViewModel, root: Document): void {
  const status = requiredElement<HTMLElement>(root, ELEMENT_IDS.status);
  const summary = requiredElement<HTMLElement>(root, ELEMENT_IDS.summary);
  const warnings = requiredElement<HTMLElement>(root, ELEMENT_IDS.warnings);
  const acknowledgementLabel = requiredElement<HTMLLabelElement>(
    root,
    ELEMENT_IDS.acknowledgementLabel,
  );
  const acknowledgement = requiredElement<HTMLInputElement>(
    root,
    ELEMENT_IDS.acknowledgement,
  );
  const download = requiredElement<HTMLButtonElement>(
    root,
    ELEMENT_IDS.download,
  );

  status.textContent = model.statusText;
  replaceListContents(summary, model.summaryLines);
  replaceListContents(warnings, model.warningLines);
  acknowledgementLabel.hidden = !model.showAcknowledgement;
  acknowledgement.disabled = !model.showAcknowledgement;
  acknowledgement.checked = model.showAcknowledgement && model.canDownload;
  download.disabled = !model.canDownload;
  download.textContent = model.downloadLabel;
}
