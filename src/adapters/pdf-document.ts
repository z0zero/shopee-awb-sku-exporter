import {
  DEFAULT_PDF_LIMITS,
  type PdfLimits,
} from './pdf-policy.js';
import type {
  PdfPageFailure,
  PdfTextDocument,
  PdfTextPage,
  PositionedTextItem,
} from './pdf-text.js';

export type PdfDocumentErrorCode = 'INACCESSIBLE_SOURCE';

export class PdfDocumentError extends Error {
  constructor(readonly code: PdfDocumentErrorCode) {
    super('PDF text layer could not be read.');
    this.name = 'PdfDocumentError';
  }
}

export interface PdfJsTextItem {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
}

export interface PdfJsTextContent {
  items: readonly unknown[];
}

export interface PdfJsPage {
  getTextContent(): Promise<PdfJsTextContent>;
}

export interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
  cleanup?(): Promise<void> | void;
}

export interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocument>;
  destroy?(): Promise<void> | void;
}

export type PdfJsGetDocument = (options: {
  data: Uint8Array;
  useWorkerFetch: false;
  useWasm: false;
  verbosity: 0;
}) => PdfJsLoadingTask;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positionedItem(item: unknown): PositionedTextItem | undefined {
  if (typeof item !== 'object' || item === null) {
    return undefined;
  }

  const candidate = item as PdfJsTextItem;
  const transform = candidate.transform;
  if (
    typeof candidate.str !== 'string' ||
    !Array.isArray(transform) ||
    !isFiniteNumber(transform[4]) ||
    !isFiniteNumber(transform[5]) ||
    !isFiniteNumber(candidate.width) ||
    !isFiniteNumber(candidate.height)
  ) {
    return undefined;
  }

  if (candidate.str === '') {
    return undefined;
  }

  return {
    str: candidate.str,
    x: transform[4],
    y: transform[5],
    width: candidate.width,
    height: candidate.height,
  };
}

async function readPage(
  document: PdfJsDocument,
  pageNumber: number,
): Promise<PdfTextPage> {
  const page = await document.getPage(pageNumber);
  const textContent = await page.getTextContent();
  return {
    pageNumber,
    items: textContent.items.flatMap((item) => {
      const positioned = positionedItem(item);
      return positioned === undefined ? [] : [positioned];
    }),
  };
}

async function cleanupDocument(
  document: PdfJsDocument | undefined,
  loadingTask: PdfJsLoadingTask | undefined,
): Promise<void> {
  try {
    await document?.cleanup?.();
  } finally {
    await loadingTask?.destroy?.();
  }
}

function asPdfDocumentError(error: unknown): PdfDocumentError {
  if (error instanceof PdfDocumentError) {
    return error;
  }

  return new PdfDocumentError('INACCESSIBLE_SOURCE');
}

export async function readPdfTextDocument(
  data: Uint8Array,
  getDocumentImpl: PdfJsGetDocument,
  limits: PdfLimits = DEFAULT_PDF_LIMITS,
): Promise<PdfTextDocument> {
  let loadingTask: PdfJsLoadingTask | undefined;
  let document: PdfJsDocument | undefined;
  let result: PdfTextDocument | undefined;
  let primaryError: PdfDocumentError | undefined;

  try {
    try {
      loadingTask = getDocumentImpl({
        data,
        useWorkerFetch: false,
        useWasm: false,
        verbosity: 0,
      });
      document = await loadingTask.promise;
      if (document.numPages > limits.maxPages) {
        throw new PdfDocumentError('INACCESSIBLE_SOURCE');
      }

      const pages: PdfTextPage[] = [];
      const failures: PdfPageFailure[] = [];

      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        try {
          pages.push(await readPage(document, pageNumber));
        } catch {
          failures.push({ pageNumber, code: 'INACCESSIBLE_SOURCE' });
        }
      }

      result = { pageCount: document.numPages, pages, failures };
    } catch (error) {
      primaryError = asPdfDocumentError(error);
    }
  } finally {
    try {
      await cleanupDocument(document, loadingTask);
    } catch {
      if (primaryError === undefined) {
        primaryError = new PdfDocumentError('INACCESSIBLE_SOURCE');
      }
    }
  }

  if (primaryError !== undefined) {
    throw primaryError;
  }

  if (result === undefined) {
    throw new PdfDocumentError('INACCESSIBLE_SOURCE');
  }

  return result;
}
