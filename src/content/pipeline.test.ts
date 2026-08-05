import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';

import type { AdapterResult, ProductRow } from '../core/types.js';
import { scanAwbPage, type ScanDependencies } from './pipeline.js';
import { discoverPdfSource, type PdfSourceDiscovery } from './pdf-source.js';
import type { PdfTextDocument } from '../adapters/pdf-text.js';

const PAGE_URL = 'https://seller.shopee.co.id/awbprint?batch=1';

function result(
  status: AdapterResult['status'],
  rows: ProductRow[] = [],
  labelsInspected = 1,
  warnings: AdapterResult['warnings'] = [],
): AdapterResult {
  return { status, labelsInspected, rows, warnings };
}

function row(sku: string, quantity: number, source: 'dom' | 'pdf'): ProductRow {
  return { sku, quantity, labelIndex: 1, source };
}

function pdfDocument(): PdfTextDocument {
  return { pageCount: 1, pages: [], failures: [] };
}

function dependencies(
  rootResult: AdapterResult,
  overrides: Partial<ScanDependencies> = {},
): ScanDependencies {
  return {
    extractDom: vi.fn(() => rootResult),
    discoverPdf: vi.fn(() => ({ status: 'none' }) as PdfSourceDiscovery),
    fetchPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
    readPdf: vi.fn(async () => pdfDocument()),
    extractPdf: vi.fn(() => result('unsupported')),
    ...overrides,
  };
}

describe('scanAwbPage', () => {
  test('rejects an unsupported URL before invoking any adapter', async () => {
    const deps = dependencies(result('complete', [row('ROOT', 1, 'dom')]));

    const scan = await scanAwbPage(
      'https://seller.shopee.co.id/orders',
      new JSDOM('<main></main>', { url: PAGE_URL }).window.document,
      deps,
    );

    expect(scan).toMatchObject({
      status: 'unsupported',
      labelsInspected: 0,
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [],
    });
    expect(deps.extractDom).not.toHaveBeenCalled();
    expect(deps.discoverPdf).not.toHaveBeenCalled();
  });

  test('returns the complete root DOM result without evaluating child-frame rows', async () => {
    const root = new JSDOM('<iframe src="/awbprint?frame=1"></iframe>', {
      url: PAGE_URL,
    }).window.document;
    const frame = root.querySelector('iframe');
    if (frame === null) {
      throw new Error('missing iframe');
    }
    const child = new JSDOM('<main></main>', { url: PAGE_URL }).window.document;
    Object.defineProperty(frame, 'contentDocument', {
      configurable: true,
      value: child,
    });
    const deps = dependencies(result('complete', [row('ROOT', 2, 'dom')]), {
      extractDom: vi.fn((document) =>
        document === child
          ? result('complete', [row('CHILD', 99, 'dom')])
          : result('complete', [row('ROOT', 2, 'dom')]),
      ),
    });

    const scan = await scanAwbPage(PAGE_URL, root, deps);

    expect(scan.status).toBe('complete');
    expect(scan.rows).toEqual([row('ROOT', 2, 'dom')]);
    expect(deps.extractDom).toHaveBeenCalledTimes(1);
  });

  test('uses shared result composition for runtime-invalid adapter rows', async () => {
    const root = new JSDOM('<main></main>', { url: PAGE_URL }).window.document;
    const adapterResult = {
      status: 'complete',
      labelsInspected: 1,
      rows: [
        row('VALID', 2, 'dom'),
        null,
        { sku: 'INVALID', quantity: 0, labelIndex: 1, source: 'dom' },
      ],
      warnings: [],
    } as unknown as AdapterResult;
    const deps = dependencies(adapterResult);

    const scan = await scanAwbPage(PAGE_URL, root, deps);

    expect(scan).toMatchObject({
      status: 'complete',
      labelsInspected: 1,
      rowsDetected: 1,
      uniqueSkus: 1,
      totalQuantity: 2,
      rows: [row('VALID', 2, 'dom')],
      warnings: [],
    });
  });

  test('uses an accessible preview frame without presentation hints when the root has no recognized DOM representation', async () => {
    const root = new JSDOM('<iframe src="/print-preview"></iframe>', {
      url: PAGE_URL,
    }).window.document;
    const frame = root.querySelector('iframe');
    if (frame === null) {
      throw new Error('missing iframe');
    }
    const child = new JSDOM('<main></main>', { url: PAGE_URL }).window.document;
    Object.defineProperty(frame, 'contentDocument', {
      configurable: true,
      value: child,
    });
    const deps = dependencies(result('unsupported'), {
      extractDom: vi.fn((document) =>
        document === child
          ? result('complete', [row('FRAME', 3, 'dom')])
          : result('unsupported'),
      ),
    });

    const scan = await scanAwbPage(PAGE_URL, root, deps);

    expect(scan.status).toBe('complete');
    expect(scan.rows).toEqual([row('FRAME', 3, 'dom')]);
  });

  test('rejects multiple recognized row-bearing frames without merging them', async () => {
    const root = new JSDOM(
      '<iframe src="/awbprint?frame=1"></iframe><iframe src="/awbprint?frame=2"></iframe>',
      { url: PAGE_URL },
    ).window.document;
    const frames = Array.from(root.querySelectorAll('iframe'));
    const children = frames.map(
      () => new JSDOM('<main></main>', { url: PAGE_URL }).window.document,
    );
    frames.forEach((frame, index) => {
      Object.defineProperty(frame, 'contentDocument', {
        configurable: true,
        value: children[index],
      });
    });
    const deps = dependencies(result('unsupported'), {
      extractDom: vi.fn((document) =>
        children.includes(document)
          ? result('complete', [
              row(document === children[0] ? 'ONE' : 'TWO', 1, 'dom'),
            ])
          : result('unsupported'),
      ),
    });

    const scan = await scanAwbPage(PAGE_URL, root, deps);

    expect(scan.status).toBe('unsupported');
    expect(scan.rows).toEqual([]);
    expect(scan.warnings.map((warning) => warning.code)).toContain(
      'UNSUPPORTED_LAYOUT',
    );
  });

  test('preserves an inaccessible candidate frame as a partial source warning', async () => {
    const root = new JSDOM(
      '<iframe src="/awbprint?frame=1"></iframe><iframe title="Print viewer" src="https://other.example/print"></iframe>',
      { url: PAGE_URL },
    ).window.document;
    const frames = Array.from(root.querySelectorAll('iframe'));
    const child = new JSDOM('<main></main>', { url: PAGE_URL }).window.document;
    Object.defineProperty(frames[0], 'contentDocument', {
      configurable: true,
      value: child,
    });
    Object.defineProperty(frames[1], 'contentDocument', {
      configurable: true,
      get: () => {
        throw new Error('private cross-origin error');
      },
    });
    const deps = dependencies(result('unsupported'), {
      extractDom: vi.fn((document) =>
        document === child
          ? result('partial', [row('FRAME', 3, 'dom')], 1, [
              {
                code: 'PARTIAL_EXTRACTION',
                message: 'Some product rows could not be extracted.',
              },
            ])
          : result('unsupported'),
      ),
    });

    const scan = await scanAwbPage(PAGE_URL, root, deps);

    expect(scan.status).toBe('partial');
    expect(scan.rows).toEqual([row('FRAME', 3, 'dom')]);
    expect(scan.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['INACCESSIBLE_SOURCE', 'PARTIAL_EXTRACTION']),
    );
    expect(
      scan.warnings.filter(
        (warning) => warning.code === 'PARTIAL_EXTRACTION',
      ),
    ).toHaveLength(1);
    expect(JSON.stringify(scan)).not.toContain('private cross-origin error');
  });

  test('selects a complete PDF result over a partial DOM result', async () => {
    const deps = dependencies(
      result('partial', [row('DOM', 1, 'dom')], 5, [
        { code: 'MISSING_SKU', message: 'A product row is missing a SKU.' },
      ]),
      {
        discoverPdf: vi.fn(
          () =>
            ({
              status: 'found',
              source: {
                kind: 'https',
                url: 'https://seller.shopee.co.id/label.pdf',
              },
            }) as const,
        ),
        extractPdf: vi.fn(() => result('complete', [row('PDF', 4, 'pdf')], 2)),
      },
    );

    const scan = await scanAwbPage(
      PAGE_URL,
      new JSDOM('<main></main>', { url: PAGE_URL }).window.document,
      deps,
    );

    expect(scan.status).toBe('complete');
    expect(scan.rows).toEqual([row('PDF', 4, 'pdf')]);
    expect(deps.fetchPdf).toHaveBeenCalledTimes(1);
  });

  test('scans an unhinted Shopee blob PDF iframe with client-only viewer parameters', async () => {
    const blobUrl =
      'blob:https://seller.shopee.co.id/44444444-4444-4444-4444-444444444444';
    const root = new JSDOM(
      `<iframe src="${blobUrl}#toolbar=0&amp;navpanes=0"></iframe>`,
      { url: PAGE_URL },
    ).window.document;
    const deps = dependencies(result('unsupported'), {
      discoverPdf: discoverPdfSource,
      extractPdf: vi.fn(() => result('complete', [row('BLOB-PDF', 2, 'pdf')])),
    });

    const scan = await scanAwbPage(PAGE_URL, root, deps);

    expect(scan.status).toBe('complete');
    expect(scan.rows).toEqual([row('BLOB-PDF', 2, 'pdf')]);
    expect(deps.fetchPdf).toHaveBeenCalledWith(
      { kind: 'blob', url: blobUrl },
      new URL(PAGE_URL),
    );
    expect(vi.mocked(deps.extractDom).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.fetchPdf).mock.invocationCallOrder[0] ?? 0,
    );
  });

  test('does not fetch an ambiguous PDF discovery and keeps a valid partial DOM result', async () => {
    const partial = result('partial', [row('DOM', 1, 'dom')], 2, [
      { code: 'MISSING_SKU', message: 'A product row is missing a SKU.' },
    ]);
    const deps = dependencies(partial, {
      discoverPdf: vi.fn(() => ({ status: 'ambiguous' }) as const),
    });

    const scan = await scanAwbPage(
      PAGE_URL,
      new JSDOM('<main></main>', { url: PAGE_URL }).window.document,
      deps,
    );

    expect(scan.status).toBe('partial');
    expect(scan.rowsDetected).toBe(1);
    expect(deps.fetchPdf).not.toHaveBeenCalled();
  });

  test('adds a partial warning and chooses the candidate with more valid rows', async () => {
    const deps = dependencies(result('unsupported'), {
      discoverPdf: vi.fn(
        () =>
          ({
            status: 'found',
            source: {
              kind: 'https',
              url: 'https://seller.shopee.co.id/label.pdf',
            },
          }) as const,
      ),
      extractPdf: vi.fn(() =>
        result('partial', [row('A', 1, 'pdf'), row('B', 2, 'pdf')], 8, [
          { code: 'MISSING_SKU', message: 'A product row is missing a SKU.' },
        ]),
      ),
    });

    const scan = await scanAwbPage(
      PAGE_URL,
      new JSDOM('<main></main>', { url: PAGE_URL }).window.document,
      deps,
    );

    expect(scan.status).toBe('partial');
    expect(scan.rowsDetected).toBe(2);
    expect(scan.totalQuantity).toBe(3);
    expect(scan.warnings.map((warning) => warning.code)).toContain(
      'PARTIAL_EXTRACTION',
    );
  });

  test('maps aggregation overflow to a non-downloadable generic unsupported result', async () => {
    const deps = dependencies(
      result('complete', [
        row('OVERFLOW', Number.MAX_SAFE_INTEGER, 'dom'),
        row('OVERFLOW', 1, 'dom'),
      ]),
    );

    const scan = await scanAwbPage(
      PAGE_URL,
      new JSDOM('<main></main>', { url: PAGE_URL }).window.document,
      deps,
    );

    expect(scan).toMatchObject({
      status: 'unsupported',
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [{ code: 'INVALID_QTY' }],
    });
    expect(scan.warnings[0]?.message).not.toContain('safe integer');
  });

  test('maps unexpected adapter errors to a generic inaccessible result', async () => {
    const deps = dependencies(result('unsupported'), {
      extractDom: vi.fn(() => {
        throw new Error('private parser details');
      }),
    });

    const scan = await scanAwbPage(
      PAGE_URL,
      new JSDOM('<main></main>', { url: PAGE_URL }).window.document,
      deps,
    );

    expect(scan.status).toBe('inaccessible');
    expect(scan.warnings).toEqual([
      { code: 'INACCESSIBLE_SOURCE', message: 'The source could not be read.' },
    ]);
    expect(JSON.stringify(scan)).not.toContain('private parser details');
  });
});
