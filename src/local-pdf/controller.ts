import {
  downloadScanCsv,
  type CsvDownloadPorts,
} from '../browser/csv-download.js';
import type { ScanResult } from '../core/types.js';
import { LocalPdfFileError, type LocalPdfFile } from './file.js';
import {
  deriveScanViewModel,
  renderScanView,
  scanResultElementIds,
} from '../ui/scan-result.js';

export interface LocalPdfPorts extends CsvDownloadPorts {
  scanLocalPdf(file: LocalPdfFile): Promise<ScanResult>;
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

function validationMessage(code: LocalPdfFileError['code']): string {
  switch (code) {
    case 'EMPTY_FILE':
    case 'INVALID_PDF_TYPE':
      return 'Choose a valid PDF file.';
    case 'PDF_TOO_LARGE':
      return 'The PDF exceeds the 50 MiB limit.';
    case 'INACCESSIBLE_SOURCE':
      return 'The selected PDF could not be read.';
  }
}

function requiredElement<T extends HTMLElement>(root: Document, id: string): T {
  const value = root.getElementById(id);
  if (!(value instanceof root.defaultView!.HTMLElement)) {
    throw new Error('Local PDF shell is missing a required control.');
  }
  return value as T;
}

export function createLocalPdfController(
  root: Document,
  ports: LocalPdfPorts,
): {
  selectFile(file: LocalPdfFile | null): Promise<void>;
  acknowledgePartial(acknowledged: boolean): void;
  download(): Promise<void>;
} {
  const fileInput = requiredElement<HTMLInputElement>(root, 'pdf-file');
  const acknowledgement = requiredElement<HTMLInputElement>(
    root,
    scanResultElementIds.acknowledgement,
  );
  const downloadButton = requiredElement<HTMLButtonElement>(
    root,
    scanResultElementIds.download,
  );
  const status = requiredElement<HTMLElement>(
    root,
    scanResultElementIds.status,
  );

  let result: ScanResult | null = null;
  let partialAcknowledged = false;
  let processing = false;
  let selectionGeneration = 0;

  function render(): void {
    renderScanView(
      deriveScanViewModel(result, partialAcknowledged, 'local-pdf'),
      root,
    );
  }

  function setProcessing(value: boolean): void {
    processing = value;
    fileInput.disabled = value;
    if (value) {
      acknowledgement.disabled = true;
      downloadButton.disabled = true;
    }
  }

  function setStatusOverride(message: string): void {
    status.textContent = message;
  }

  async function selectFile(file: LocalPdfFile | null): Promise<void> {
    if (processing) {
      return;
    }

    selectionGeneration += 1;
    result = null;
    partialAcknowledged = false;
    render();

    if (file === null) {
      return;
    }

    setProcessing(true);
    setStatusOverride('Processing PDF…');

    let override: string | undefined;
    try {
      result = await ports.scanLocalPdf(file);
    } catch (error) {
      if (error instanceof LocalPdfFileError) {
        override = validationMessage(error.code);
      } else {
        result = inaccessibleResult();
      }
    } finally {
      setProcessing(false);
      render();
    }

    if (override !== undefined) {
      setStatusOverride(override);
    }
  }

  function acknowledgePartial(acknowledged: boolean): void {
    if (processing || result?.status !== 'partial') {
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
    if (processing) {
      return;
    }

    const downloadGeneration = selectionGeneration;
    const outcome = await downloadScanCsv(result, partialAcknowledged, ports);

    if (downloadGeneration !== selectionGeneration) {
      return;
    }

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

  return { selectFile, acknowledgePartial, download };
}
