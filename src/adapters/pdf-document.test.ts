import { describe, expect, test, vi } from 'vitest';

import {
  PdfDocumentError,
  readPdfTextDocument,
  type PdfJsDocument,
  type PdfJsGetDocument,
  type PdfJsPage,
} from './pdf-document.js';
import { extractPdfTextRows } from './pdf-text.js';

function pdfTextItem(
  str: unknown,
  x: number,
  y: number,
  width: unknown = 10,
  height: unknown = 7,
) {
  return {
    str,
    transform: [1, 0, 0, 1, x, y],
    width,
    height,
  };
}

function page(itemsOrError: readonly unknown[] | Error): PdfJsPage {
  return {
    getTextContent: vi.fn(async () => {
      if (itemsOrError instanceof Error) {
        throw itemsOrError;
      }

      return { items: itemsOrError };
    }),
  };
}

function loaderFor(documentOrError: PdfJsDocument | Error): {
  getDocument: PdfJsGetDocument;
  loadingTask: {
    promise: Promise<PdfJsDocument>;
    destroy: ReturnType<typeof vi.fn>;
  };
} {
  const loadingTask = {
    promise:
      documentOrError instanceof Error
        ? Promise.reject(documentOrError)
        : Promise.resolve(documentOrError),
    destroy: vi.fn(async () => undefined),
  };

  return {
    loadingTask,
    getDocument: vi.fn(() => loadingTask),
  };
}

describe('readPdfTextDocument', () => {
  test('keeps a long SKU identifiable by its left edge when its width crosses an adjacent midpoint', async () => {
    const sourcePage = page([
      pdfTextItem('Nama Produk', 30, 700, 35.1, 7.48),
      pdfTextItem('SKU', 165, 700, 10.96, 7.48),
      pdfTextItem('Variasi', 210, 700, 28.04, 7.48),
      pdfTextItem('Qty', 270, 700, 11.6, 7.48),
      pdfTextItem('Synthetic Product', 30, 650, 70, 7.48),
      pdfTextItem('LONG-SYNTHETIC-SKU', 140, 650, 80, 7.48),
      pdfTextItem('Standard', 210, 650, 28, 7.48),
      pdfTextItem('2', 272, 648.5, 4, 7.48),
    ]);
    const { getDocument } = loaderFor({
      numPages: 1,
      getPage: vi.fn(async () => sourcePage),
    });

    const document = await readPdfTextDocument(
      new Uint8Array([1]),
      getDocument,
    );

    expect(extractPdfTextRows(document)).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: 'LONG-SYNTHETIC-SKU',
          quantity: 2,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('converts PDF.js text item geometry into the positioned-text contract without logging text', async () => {
    const firstPage = page([
      pdfTextItem('SKU-001', 30, 700, 42, 8),
      pdfTextItem('', 40, 690),
      pdfTextItem('ignored width', 40, 680, Number.NaN, 8),
      pdfTextItem(123, 50, 670),
      { str: 'missing transform', width: 10, height: 10 },
    ]);
    const secondPage = page([pdfTextItem('QTY', 500, 650, 12, 8)]);
    const getPage = vi.fn(async (pageNumber: number) => {
      if (pageNumber === 1) {
        return firstPage;
      }

      return secondPage;
    });
    const cleanup = vi.fn(async () => undefined);
    const { getDocument, loadingTask } = loaderFor({
      numPages: 2,
      getPage,
      cleanup,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      readPdfTextDocument(new Uint8Array([1, 2, 3]), getDocument),
    ).resolves.toEqual({
      pageCount: 2,
      pages: [
        {
          pageNumber: 1,
          items: [{ str: 'SKU-001', x: 30, y: 700, width: 42, height: 8 }],
        },
        {
          pageNumber: 2,
          items: [{ str: 'QTY', x: 500, y: 650, width: 12, height: 8 }],
        },
      ],
      failures: [],
    });
    expect(getDocument).toHaveBeenCalledWith({
      data: new Uint8Array([1, 2, 3]),
      useWorkerFetch: false,
      useWasm: false,
      verbosity: 0,
    });
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(getPage).toHaveBeenNthCalledWith(1, 1);
    expect(getPage).toHaveBeenNthCalledWith(2, 2);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(loadingTask.destroy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('isolates unreadable pages and continues through later pages with generic failures', async () => {
    const pages = new Map<number, PdfJsPage | Error>([
      [1, page([pdfTextItem('FIRST', 10, 10)])],
      [2, new Error('private getPage failure')],
      [3, page(new Error('private text content failure'))],
      [4, page([pdfTextItem('FOURTH', 40, 40)])],
    ]);
    const getPage = vi.fn(async (pageNumber: number) => {
      const value = pages.get(pageNumber);
      if (value instanceof Error) {
        throw value;
      }
      if (value === undefined) {
        throw new Error('unexpected page');
      }
      return value;
    });
    const cleanup = vi.fn(async () => undefined);
    const { getDocument, loadingTask } = loaderFor({
      numPages: 4,
      getPage,
      cleanup,
    });

    await expect(
      readPdfTextDocument(new Uint8Array([1]), getDocument),
    ).resolves.toEqual({
      pageCount: 4,
      pages: [
        {
          pageNumber: 1,
          items: [{ str: 'FIRST', x: 10, y: 10, width: 10, height: 7 }],
        },
        {
          pageNumber: 4,
          items: [{ str: 'FOURTH', x: 40, y: 40, width: 10, height: 7 }],
        },
      ],
      failures: [
        { pageNumber: 2, code: 'INACCESSIBLE_SOURCE' },
        { pageNumber: 3, code: 'INACCESSIBLE_SOURCE' },
      ],
    });
    expect(getPage).toHaveBeenCalledTimes(4);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(loadingTask.destroy).toHaveBeenCalledTimes(1);
  });

  test('rejects documents over the page cap before page iteration and still cleans up', async () => {
    const getPage = vi.fn();
    const cleanup = vi.fn(async () => undefined);
    const { getDocument, loadingTask } = loaderFor({
      numPages: 3,
      getPage,
      cleanup,
    });

    await expect(
      readPdfTextDocument(new Uint8Array([1]), getDocument, {
        maxBytes: 50,
        maxPages: 2,
      }),
    ).rejects.toBeInstanceOf(PdfDocumentError);
    await expect(
      readPdfTextDocument(new Uint8Array([1]), getDocument, {
        maxBytes: 50,
        maxPages: 2,
      }),
    ).rejects.toMatchObject({ code: 'INACCESSIBLE_SOURCE' });
    expect(getPage).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(loadingTask.destroy).toHaveBeenCalledTimes(2);
  });

  test('maps document-load failures to a whole-source inaccessible error without internal details', async () => {
    const { getDocument, loadingTask } = loaderFor(
      new Error('private parser stack'),
    );

    await expect(
      readPdfTextDocument(new Uint8Array([1]), getDocument),
    ).rejects.toMatchObject({ code: 'INACCESSIBLE_SOURCE' });
    await expect(
      readPdfTextDocument(new Uint8Array([1]), getDocument),
    ).rejects.not.toThrow(/private parser stack/u);
    expect(loadingTask.destroy).toHaveBeenCalledTimes(2);
  });

  test('maps synchronous loader failures to a whole-source inaccessible error without internal details', async () => {
    const getDocument = vi.fn<PdfJsGetDocument>(() => {
      throw new Error('private synchronous loader detail');
    });

    const result = readPdfTextDocument(new Uint8Array([1]), getDocument);

    await expect(result).rejects.toMatchObject({
      code: 'INACCESSIBLE_SOURCE',
    });
    await expect(result).rejects.not.toThrow(
      /private synchronous loader detail/u,
    );
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  test('attempts destroy when cleanup rejects and keeps teardown errors generic', async () => {
    const cleanup = vi.fn(async () => {
      throw new Error('private cleanup detail');
    });
    const sourcePage = page([]);
    const { getDocument, loadingTask } = loaderFor({
      numPages: 1,
      getPage: vi.fn(async () => sourcePage),
      cleanup,
    });

    const result = readPdfTextDocument(new Uint8Array([1]), getDocument);

    await expect(result).rejects.toMatchObject({
      code: 'INACCESSIBLE_SOURCE',
    });
    await expect(result).rejects.not.toThrow(/private cleanup detail/u);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(loadingTask.destroy).toHaveBeenCalledTimes(1);
  });

  test('preserves a typed primary failure when cleanup and destroy also reject', async () => {
    const primary = new PdfDocumentError('INACCESSIBLE_SOURCE');
    const cleanup = vi.fn(async () => {
      throw new Error('private cleanup detail');
    });
    const loadingTask = {
      promise: Promise.resolve({
        get numPages(): number {
          throw primary;
        },
        getPage: vi.fn(),
        cleanup,
      } as unknown as PdfJsDocument),
      destroy: vi.fn(async () => {
        throw new Error('private destroy detail');
      }),
    };
    const getDocument = vi.fn(() => loadingTask);

    const result = readPdfTextDocument(new Uint8Array([1]), getDocument);

    await expect(result).rejects.toBe(primary);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(loadingTask.destroy).toHaveBeenCalledTimes(1);
  });
});
