import {
  GlobalWorkerOptions,
  getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
  readPdfTextDocument,
  type PdfJsGetDocument,
} from '../adapters/pdf-document.js';
import { extractDomRows } from '../adapters/dom.js';
import { extractPdfTextRows } from '../adapters/pdf-text.js';
import { scanAwbPage, type ScanDependencies } from './pipeline.js';
import { discoverPdfSource, fetchPdfBytes } from './pdf-source.js';
import { isScanRequest, type ScanResponse } from '../shared/messages.js';
import type { ScanResult } from '../core/types.js';

export interface ScanRuntime {
  getURL(path: string): string;
  onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void,
      ) => boolean | void,
    ): void;
  };
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

export function createScanDependencies(
  runtime: Pick<ScanRuntime, 'getURL'>,
): ScanDependencies {
  GlobalWorkerOptions.workerSrc = runtime.getURL('vendor/pdf.worker.min.mjs');
  const getDocumentImpl = getDocument as unknown as PdfJsGetDocument;

  return {
    extractDom: extractDomRows,
    discoverPdf: discoverPdfSource,
    fetchPdf: fetchPdfBytes,
    readPdf: (data) => readPdfTextDocument(data, getDocumentImpl),
    extractPdf: extractPdfTextRows,
  };
}

export function registerScanListener(
  runtime: ScanRuntime,
  getPageUrl: () => string = () => globalThis.location.href,
  getRootDocument: () => Document = () => globalThis.document,
  dependencies: ScanDependencies = createScanDependencies(runtime),
): void {
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isScanRequest(message)) {
      return false;
    }

    void Promise.resolve()
      .then(() => scanAwbPage(getPageUrl(), getRootDocument(), dependencies))
      .catch(() => inaccessibleResult())
      .then((result) => {
        const response: ScanResponse = { type: 'SCAN_RESULT', result };
        sendResponse(response);
      });

    return true;
  });
}

if (
  typeof chrome !== 'undefined' &&
  typeof document !== 'undefined' &&
  chrome.runtime?.onMessage !== undefined
) {
  registerScanListener(chrome.runtime as unknown as ScanRuntime);
}
