import {
  downloadScanCsv,
  type CsvDownloadPorts,
} from '../browser/csv-download.js';
import { isSupportedAwbUrl } from '../core/url.js';
import type { ScanResult } from '../core/types.js';
import { isScanResponse, type ScanResponse } from '../shared/messages.js';
import {
  deriveScanViewModel,
  renderScanView,
  scanResultElementIds,
} from '../ui/scan-result.js';

export interface PopupPorts extends CsvDownloadPorts {
  getActiveTab(): Promise<{ id: number; url?: string } | null>;
  requestScan(tabId: number): Promise<ScanResponse>;
  openLocalPdfPage(): Promise<void>;
}

function inaccessibleResult(): ScanResult {
  return {
    status: 'inaccessible',
    labelsInspected: 0,
    rowsDetected: 0,
    uniqueSkus: 0,
    totalQuantity: 0,
    rows: [],
    warnings: [
      { code: 'INACCESSIBLE_SOURCE', message: 'The source could not be read.' },
    ],
  };
}

function unsupportedResult(): ScanResult {
  return {
    status: 'unsupported',
    labelsInspected: 0,
    rowsDetected: 0,
    uniqueSkus: 0,
    totalQuantity: 0,
    rows: [],
    warnings: [],
  };
}

function element<T extends HTMLElement>(root: Document, id: string): T {
  const value = root.getElementById(id);
  if (!(value instanceof root.defaultView!.HTMLElement)) {
    throw new Error('Popup shell is missing a required control.');
  }
  return value as T;
}

export function createPopupController(
  root: Document,
  ports: PopupPorts,
): {
  scan(): Promise<void>;
  openLocalPdfPage(): Promise<void>;
  acknowledgePartial(acknowledged: boolean): void;
  download(): Promise<void>;
} {
  const scanButton = element<HTMLButtonElement>(root, 'scan-button');
  const choosePdfButton = element<HTMLButtonElement>(
    root,
    'choose-pdf-button',
  );
  const acknowledgement = element<HTMLInputElement>(
    root,
    scanResultElementIds.acknowledgement,
  );
  const downloadButton = element<HTMLButtonElement>(
    root,
    scanResultElementIds.download,
  );
  const status = element<HTMLElement>(root, scanResultElementIds.status);

  let result: ScanResult | null = null;
  let partialAcknowledged = false;
  let scanning = false;

  function render(): void {
    renderScanView(
      deriveScanViewModel(result, partialAcknowledged, 'awb'),
      root,
    );
  }

  function setStatusOverride(message: string): void {
    status.textContent = message;
  }

  function setScanning(value: boolean): void {
    scanning = value;
    scanButton.disabled = value;
    choosePdfButton.disabled = value;
    if (value) {
      acknowledgement.disabled = true;
      downloadButton.disabled = true;
    }
  }

  async function scan(): Promise<void> {
    if (scanning) {
      return;
    }

    result = null;
    partialAcknowledged = false;
    render();
    setScanning(true);
    setStatusOverride('Scanning…');

    try {
      const tab = await ports.getActiveTab();
      if (
        tab === null ||
        !Number.isSafeInteger(tab.id) ||
        tab.id < 0 ||
        tab.url === undefined ||
        !isSupportedAwbUrl(tab.url)
      ) {
        result = unsupportedResult();
        return;
      }

      const response: unknown = await ports.requestScan(tab.id);
      result = isScanResponse(response)
        ? response.result
        : inaccessibleResult();
    } catch {
      result = inaccessibleResult();
    } finally {
      setScanning(false);
      render();
    }
  }

  async function openLocalPdfPage(): Promise<void> {
    if (scanning) {
      return;
    }

    try {
      await ports.openLocalPdfPage();
    } catch {
      setStatusOverride('Could not open the downloaded PDF page. Try again.');
    }
  }

  function acknowledgePartial(acknowledged: boolean): void {
    if (scanning || result?.status !== 'partial') {
      acknowledgement.checked = false;
      partialAcknowledged = false;
      render();
      return;
    }

    partialAcknowledged = acknowledged;
    acknowledgement.checked = acknowledged;
    render();
  }

  async function download(): Promise<void> {
    const outcome = await downloadScanCsv(
      result,
      partialAcknowledged,
      ports,
    );

    switch (outcome) {
      case 'acknowledgement-required':
        setStatusOverride(
          'Review and acknowledge every warning before downloading.',
        );
        break;
      case 'unavailable':
        setStatusOverride('A downloadable scan result is not available.');
        break;
      case 'failed':
        setStatusOverride('The CSV download failed. Try again.');
        break;
    }
  }

  render();

  return { scan, openLocalPdfPage, acknowledgePartial, download };
}
