import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';

import type { ScanResult } from '../core/types.js';
import { LocalPdfFileError, type LocalPdfFile } from './file.js';
import { createLocalPdfController, type LocalPdfPorts } from './controller.js';

function result(
  status: ScanResult['status'],
  overrides: Partial<ScanResult> = {},
): ScanResult {
  const downloadable = status === 'complete' || status === 'partial';
  return {
    status,
    labelsInspected: 1,
    rowsDetected: downloadable ? 1 : 0,
    uniqueSkus: downloadable ? 1 : 0,
    totalQuantity: downloadable ? 2 : 0,
    rows: downloadable
      ? [{ sku: '0001', quantity: 2, labelIndex: 1, source: 'pdf' }]
      : [],
    warnings:
      status === 'partial'
        ? [
            {
              code: 'PARTIAL_EXTRACTION',
              message: 'Some product rows could not be extracted.',
            },
          ]
        : [],
    ...overrides,
  };
}

function file(size = 5): LocalPdfFile {
  return {
    size,
    arrayBuffer: vi.fn(async () => new ArrayBuffer(size)),
  };
}

function shell(): Document {
  return new JSDOM(`
    <main>
      <h1>Scan a downloaded Shopee AWB PDF</h1>
      <input id="pdf-file" type="file" accept="application/pdf,.pdf">
      <p id="status" role="status"></p>
      <ul id="summary-list"></ul>
      <ul id="warnings-list"></ul>
      <label id="partial-acknowledgement-label">
        <input id="partial-acknowledgement" type="checkbox">
      </label>
      <button id="download-button" type="button" disabled>Download CSV</button>
    </main>
  `).window.document;
}

function ports(overrides: Partial<LocalPdfPorts> = {}): LocalPdfPorts {
  return {
    scanLocalPdf: vi.fn(async () => result('complete')),
    download: vi.fn(async () => 1),
    createObjectUrl: vi.fn(() => 'blob:local-pdf-test'),
    revokeObjectUrl: vi.fn(),
    now: vi.fn(() => new Date(2026, 7, 5, 10, 11, 12)),
    ...overrides,
  };
}

function status(document: Document): string {
  return document.getElementById('status')?.textContent ?? '';
}

describe('createLocalPdfController selection flow', () => {
  test('starts ready and keeps the ready state when no file is selected', async () => {
    const document = shell();
    const controller = createLocalPdfController(document, ports());

    expect(status(document)).toBe('Choose a downloaded Shopee AWB PDF.');
    await controller.selectFile(null);

    expect(status(document)).toBe('Choose a downloaded Shopee AWB PDF.');
    expect(document.getElementById('summary-list')?.textContent).toBe('');
  });

  test('disables file and result controls while a PDF is processing', async () => {
    let resolveScan: (value: ScanResult) => void = () => undefined;
    const scanLocalPdf = vi.fn(
      () => new Promise<ScanResult>((resolve) => (resolveScan = resolve)),
    );
    const document = shell();
    const controller = createLocalPdfController(
      document,
      ports({ scanLocalPdf }),
    );
    const pending = controller.selectFile(file());

    expect(
      (document.getElementById('pdf-file') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (document.getElementById('partial-acknowledgement') as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (document.getElementById('download-button') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(status(document)).toContain('Processing');

    resolveScan(result('complete'));
    await pending;
    expect(
      (document.getElementById('pdf-file') as HTMLInputElement).disabled,
    ).toBe(false);
  });

  test('renders a complete result and downloads it', async () => {
    const document = shell();
    const download = vi.fn(async () => 1);
    const controller = createLocalPdfController(document, ports({ download }));

    await controller.selectFile(file());
    expect(status(document)).toBe('Scan complete.');
    expect(document.getElementById('summary-list')?.textContent).toContain(
      'Unique SKUs: 1',
    );

    await controller.download();
    expect(download).toHaveBeenCalledTimes(1);
  });

  test('clears the partial acknowledgement and replaces the first result', async () => {
    const scanLocalPdf = vi
      .fn<LocalPdfPorts['scanLocalPdf']>()
      .mockResolvedValueOnce(result('partial'))
      .mockResolvedValueOnce(
        result('complete', {
          rows: [{ sku: '0002', quantity: 7, labelIndex: 1, source: 'pdf' }],
          totalQuantity: 7,
        }),
      );
    const document = shell();
    const controller = createLocalPdfController(
      document,
      ports({ scanLocalPdf }),
    );

    await controller.selectFile(file());
    controller.acknowledgePartial(true);
    expect(
      (document.getElementById('partial-acknowledgement') as HTMLInputElement)
        .checked,
    ).toBe(true);

    await controller.selectFile(file());
    expect(status(document)).toBe('Scan complete.');
    expect(document.getElementById('summary-list')?.textContent).toContain(
      'Total quantity: 7',
    );
    expect(document.getElementById('summary-list')?.textContent).not.toContain(
      'Total quantity: 2',
    );
    expect(
      (document.getElementById('partial-acknowledgement') as HTMLInputElement)
        .checked,
    ).toBe(false);
  });
});

describe('createLocalPdfController error and download boundaries', () => {
  test.each([
    ['EMPTY_FILE', 'Choose a valid PDF file.'],
    ['INVALID_PDF_TYPE', 'Choose a valid PDF file.'],
    ['PDF_TOO_LARGE', 'The PDF exceeds the 50 MiB limit.'],
    ['INACCESSIBLE_SOURCE', 'The selected PDF could not be read.'],
  ] as const)(
    'maps %s without exposing parser details',
    async (code, message) => {
      const document = shell();
      const scanLocalPdf = vi.fn(async () => {
        throw new LocalPdfFileError(code);
      });
      const controller = createLocalPdfController(
        document,
        ports({ scanLocalPdf }),
      );

      await controller.selectFile(file());

      expect(status(document)).toBe(message);
      expect(document.getElementById('summary-list')?.textContent).toBe('');
    },
  );

  test('maps a generic scan rejection through the shared inaccessible result', async () => {
    const document = shell();
    const controller = createLocalPdfController(
      document,
      ports({
        scanLocalPdf: vi.fn(async () => {
          throw new Error('private parser detail');
        }),
      }),
    );

    await controller.selectFile(file());

    expect(status(document)).toContain('Could not read the source');
    expect(status(document)).not.toContain('private parser detail');
    expect(document.getElementById('warnings-list')?.textContent).toContain(
      'The source could not be read.',
    );
  });

  test('keeps the current result available after a CSV download failure', async () => {
    const document = shell();
    const controller = createLocalPdfController(
      document,
      ports({
        download: vi.fn(async () => {
          throw new Error('private download detail');
        }),
      }),
    );

    await controller.selectFile(file());
    await controller.download();

    expect(status(document)).toBe('The CSV download failed. Try again.');
    expect(document.getElementById('summary-list')?.textContent).toContain(
      'Unique SKUs: 1',
    );
    expect(status(document)).not.toContain('private download detail');
  });

  test('does not let a stale download failure overwrite a replacement scan', async () => {
    let rejectDownload: (reason?: unknown) => void = () => undefined;
    const download = vi.fn(
      () =>
        new Promise<number>((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );
    const scanLocalPdf = vi
      .fn<LocalPdfPorts['scanLocalPdf']>()
      .mockResolvedValueOnce(result('complete'))
      .mockResolvedValueOnce(
        result('complete', {
          rows: [{ sku: '0002', quantity: 7, labelIndex: 1, source: 'pdf' }],
          totalQuantity: 7,
        }),
      );
    const document = shell();
    const controller = createLocalPdfController(
      document,
      ports({ download, scanLocalPdf }),
    );

    await controller.selectFile(file());
    const pendingDownload = controller.download();

    await controller.selectFile(file());
    expect(status(document)).toBe('Scan complete.');
    expect(document.getElementById('summary-list')?.textContent).toContain(
      'Total quantity: 7',
    );

    rejectDownload(new Error('private download detail'));
    await pendingDownload;

    expect(status(document)).toBe('Scan complete.');
    expect(status(document)).not.toContain('CSV download failed');
    expect(document.getElementById('summary-list')?.textContent).toContain(
      'Total quantity: 7',
    );
  });

  test('does not let a stale download failure overwrite a cleared selection', async () => {
    let rejectDownload: (reason?: unknown) => void = () => undefined;
    const download = vi.fn(
      () =>
        new Promise<number>((_resolve, reject) => {
          rejectDownload = reject;
        }),
    );
    const document = shell();
    const controller = createLocalPdfController(document, ports({ download }));

    await controller.selectFile(file());
    const pendingDownload = controller.download();

    await controller.selectFile(null);
    expect(status(document)).toBe('Choose a downloaded Shopee AWB PDF.');

    rejectDownload(new Error('private download detail'));
    await pendingDownload;

    expect(status(document)).toBe('Choose a downloaded Shopee AWB PDF.');
    expect(document.getElementById('summary-list')?.textContent).toBe('');
  });
});
