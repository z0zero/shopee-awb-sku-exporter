import {
  GlobalWorkerOptions,
  getDocument,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

import { extractPdfTextRows } from '../adapters/pdf-text.js';
import {
  readPdfTextDocument,
  type PdfJsGetDocument,
} from '../adapters/pdf-document.js';
import { readLocalPdfBytes } from './file.js';
import { createLocalPdfController, type LocalPdfPorts } from './controller.js';
import { scanLocalPdf } from './pipeline.js';
import type { LocalPdfDependencies } from './pipeline.js';

export interface LocalPdfRuntime {
  getURL(path: string): string;
}

export function createLocalPdfDependencies(
  runtime: Pick<LocalPdfRuntime, 'getURL'>,
): LocalPdfDependencies {
  GlobalWorkerOptions.workerSrc = runtime.getURL('vendor/pdf.worker.min.mjs');
  const getDocumentImpl = getDocument as unknown as PdfJsGetDocument;

  return {
    readBytes: (file) => readLocalPdfBytes(file),
    readPdf: (data) => readPdfTextDocument(data, getDocumentImpl),
    extractPdf: extractPdfTextRows,
  };
}

function createPorts(): LocalPdfPorts {
  const dependencies = createLocalPdfDependencies(chrome.runtime);
  return {
    scanLocalPdf: (file) => scanLocalPdf(file, dependencies),
    download: (options) => chrome.downloads.download(options),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    now: () => new Date(),
  };
}

function main(): void {
  const controller = createLocalPdfController(document, createPorts());
  document.getElementById('pdf-file')?.addEventListener('change', (event) => {
    const input = event.currentTarget;
    if (input instanceof HTMLInputElement) {
      void controller.selectFile(input.files?.[0] ?? null);
    }
  });
  document
    .getElementById('partial-acknowledgement')
    ?.addEventListener('change', (event) => {
      const input = event.currentTarget;
      if (input instanceof HTMLInputElement) {
        controller.acknowledgePartial(input.checked);
      }
    });
  document
    .getElementById('download-button')
    ?.addEventListener('click', () => void controller.download());
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  main();
}
