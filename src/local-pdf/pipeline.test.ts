import { describe, expect, test, vi } from 'vitest';

import type { PdfTextDocument } from '../adapters/pdf-text.js';
import type { AdapterResult, ProductRow } from '../core/types.js';
import { LocalPdfFileError, type LocalPdfFile } from './file.js';
import { scanLocalPdf, type LocalPdfDependencies } from './pipeline.js';

function syntheticFile(): LocalPdfFile {
  return {
    size: 5,
    arrayBuffer: async () => new ArrayBuffer(5),
  };
}

function syntheticDocument(): PdfTextDocument {
  return { pageCount: 1, pages: [], failures: [] };
}

function row(sku: string, quantity: number): ProductRow {
  return { sku, quantity, labelIndex: 1, source: 'pdf' };
}

function adapterResult(
  status: AdapterResult['status'],
  rows: ProductRow[] = [],
): AdapterResult {
  return { status, labelsInspected: 1, rows, warnings: [] };
}

function dependencies(
  overrides: Partial<LocalPdfDependencies> = {},
): LocalPdfDependencies {
  return {
    readBytes: vi.fn(
      async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    ),
    readPdf: vi.fn(async () => syntheticDocument()),
    extractPdf: vi.fn(() => adapterResult('unsupported')),
    ...overrides,
  };
}

describe('scanLocalPdf', () => {
  test('returns the composed complete result from the injected local pipeline', async () => {
    const file = syntheticFile();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const document = syntheticDocument();
    const deps = dependencies({
      readBytes: vi.fn(async () => bytes),
      readPdf: vi.fn(async (data) => {
        expect(data).toBe(bytes);
        return document;
      }),
      extractPdf: vi.fn((value) => {
        expect(value).toBe(document);
        return adapterResult('complete', [row('SYNTHETIC-SKU', 2)]);
      }),
    });

    await expect(scanLocalPdf(file, deps)).resolves.toEqual({
      status: 'complete',
      labelsInspected: 1,
      rowsDetected: 1,
      uniqueSkus: 1,
      totalQuantity: 2,
      rows: [row('SYNTHETIC-SKU', 2)],
      warnings: [],
    });
    expect(deps.readBytes).toHaveBeenCalledWith(file);
    expect(deps.readPdf).toHaveBeenCalledTimes(1);
    expect(deps.extractPdf).toHaveBeenCalledTimes(1);
  });

  test('maps a PDF read rejection to a generic inaccessible result', async () => {
    const deps = dependencies({
      readPdf: vi.fn(async () => {
        throw new Error();
      }),
    });

    const result = await scanLocalPdf(syntheticFile(), deps);

    expect(result).toMatchObject({
      status: 'inaccessible',
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [{ code: 'INACCESSIBLE_SOURCE' }],
    });
    expect(JSON.stringify(result)).not.toContain('Error');
  });

  test('maps PDF extraction rejection to a generic inaccessible result', async () => {
    const deps = dependencies({
      extractPdf: vi.fn(() => {
        throw new Error();
      }),
    });

    const result = await scanLocalPdf(syntheticFile(), deps);

    expect(result).toMatchObject({
      status: 'inaccessible',
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [{ code: 'INACCESSIBLE_SOURCE' }],
    });
  });

  test('preserves an unsupported text layout result', async () => {
    const result = await scanLocalPdf(
      syntheticFile(),
      dependencies({
        extractPdf: vi.fn(() => adapterResult('unsupported')),
      }),
    );

    expect(result).toMatchObject({
      status: 'unsupported',
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [{ code: 'UNSUPPORTED_LAYOUT' }],
    });
  });

  test('propagates a LocalPdfFileError unchanged', async () => {
    const expected = new LocalPdfFileError('INVALID_PDF_TYPE');
    const deps = dependencies({
      readBytes: vi.fn(async () => {
        throw expected;
      }),
    });

    await expect(scanLocalPdf(syntheticFile(), deps)).rejects.toBe(expected);
  });
});
