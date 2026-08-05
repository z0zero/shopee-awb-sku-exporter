import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';

import type { ScanResult } from '../core/types.js';
import { createPopupController, type PopupPorts } from './controller.js';

const PAGE_URL = 'https://seller.shopee.co.id/awbprint?batch=1';

function result(
  status: ScanResult['status'],
  overrides: Partial<ScanResult> = {},
): ScanResult {
  const rows = [
    { sku: '0001', quantity: 2, labelIndex: 1, source: 'dom' as const },
    { sku: '0002', quantity: 3, labelIndex: 1, source: 'dom' as const },
  ];
  return {
    status,
    labelsInspected: 1,
    rowsDetected: status === 'complete' || status === 'partial' ? 2 : 0,
    uniqueSkus: status === 'complete' || status === 'partial' ? 2 : 0,
    totalQuantity: status === 'complete' || status === 'partial' ? 5 : 0,
    rows: status === 'complete' || status === 'partial' ? rows : [],
    warnings:
      status === 'partial'
        ? [
            {
              code: 'PARTIAL_EXTRACTION' as const,
              message: 'Some product rows could not be extracted.',
            },
          ]
        : [],
    ...overrides,
  };
}

function shell(): Document {
  return new JSDOM(`
    <main>
      <button id="scan-button" type="button">Scan AWB</button>
      <button id="choose-pdf-button" type="button">Choose downloaded PDF</button>
      <p id="status"></p>
      <ul id="summary-list"></ul>
      <ul id="warnings-list"></ul>
      <label id="partial-acknowledgement-label"><input id="partial-acknowledgement" type="checkbox"></label>
      <button id="download-button" type="button" disabled>Download CSV</button>
    </main>
  `).window.document;
}

function ports(overrides: Partial<PopupPorts> = {}): PopupPorts {
  return {
    getActiveTab: vi.fn(async () => ({ id: 7, url: PAGE_URL })),
    openLocalPdfPage: vi.fn(async () => undefined),
    requestScan: vi.fn<PopupPorts['requestScan']>(async () => ({
      type: 'SCAN_RESULT',
      result: result('complete'),
    })),
    download: vi.fn(async () => 1),
    createObjectUrl: vi.fn(() => 'blob:popup-test'),
    revokeObjectUrl: vi.fn(),
    now: vi.fn(() => new Date(2026, 7, 3, 14, 5, 9)),
    ...overrides,
  };
}

describe('createPopupController scan flow', () => {
  test('opens the persistent local PDF page once and hides raw launch failures', async () => {
    const openLocalPdfPage = vi.fn(async () => {
      throw new Error('private tab creation detail');
    });
    const document = shell();
    const controller = createPopupController(
      document,
      ports({ openLocalPdfPage }),
    );

    await controller.openLocalPdfPage();

    expect(openLocalPdfPage).toHaveBeenCalledTimes(1);
    expect(document.getElementById('status')?.textContent).toBe(
      'Could not open the downloaded PDF page. Try again.',
    );
    expect(document.getElementById('status')?.textContent).not.toContain(
      'private tab creation detail',
    );
  });

  test('does not send a request for an unsupported or missing active tab', async () => {
    const unsupportedRequest = vi.fn<PopupPorts['requestScan']>();
    const unsupportedController = createPopupController(
      shell(),
      ports({
        getActiveTab: vi.fn(async () => ({
          id: 1,
          url: 'https://seller.shopee.co.id/orders',
        })),
        requestScan: unsupportedRequest,
      }),
    );
    await unsupportedController.scan();
    expect(unsupportedRequest).not.toHaveBeenCalled();

    const missingRequest = vi.fn<PopupPorts['requestScan']>();
    const missingController = createPopupController(
      shell(),
      ports({
        getActiveTab: vi.fn(async () => null),
        requestScan: missingRequest,
      }),
    );
    await missingController.scan();
    expect(missingRequest).not.toHaveBeenCalled();
  });

  test('disables controls while scanning and resets prior result and acknowledgement', async () => {
    let resolveFirst: (
      value: Awaited<ReturnType<PopupPorts['requestScan']>>,
    ) => void = () => undefined;
    const requestScan = vi.fn<PopupPorts['requestScan']>(
      () =>
        new Promise<Awaited<ReturnType<PopupPorts['requestScan']>>>(
          (resolve) => {
            resolveFirst = resolve;
          },
        ),
    );
    const document = shell();
    const controller = createPopupController(document, ports({ requestScan }));
    const scanPromise = controller.scan();

    expect(
      (document.getElementById('scan-button') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (document.getElementById('choose-pdf-button') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(document.getElementById('status')?.textContent).toBe('Scanning…');
    await vi.waitFor(() => expect(requestScan).toHaveBeenCalled());
    resolveFirst({ type: 'SCAN_RESULT', result: result('partial') });
    await scanPromise;
    controller.acknowledgePartial(true);
    expect(
      (document.getElementById('partial-acknowledgement') as HTMLInputElement)
        .checked,
    ).toBe(true);

    let resolveSecond: (
      value: Awaited<ReturnType<PopupPorts['requestScan']>>,
    ) => void = () => undefined;
    requestScan.mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<PopupPorts['requestScan']>>>(
          (resolve) => {
            resolveSecond = resolve;
          },
        ),
    );
    const secondScan = controller.scan();
    expect(
      (document.getElementById('partial-acknowledgement') as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(document.getElementById('summary-list')?.textContent).toBe('');
    await vi.waitFor(() => expect(requestScan).toHaveBeenCalledTimes(2));
    resolveSecond({ type: 'SCAN_RESULT', result: result('complete') });
    await secondScan;
    expect(document.getElementById('status')?.textContent).toBe(
      'Scan complete.',
    );
  });

  test('maps malformed responses and API failures to generic inaccessible states', async () => {
    for (const requestScan of [
      vi.fn<PopupPorts['requestScan']>(async () => null as never),
      vi.fn<PopupPorts['requestScan']>(async () => {
        throw new Error('private API detail');
      }),
    ]) {
      const document = shell();
      const controller = createPopupController(
        document,
        ports({ requestScan }),
      );
      await controller.scan();
      expect(document.getElementById('status')?.textContent).toContain(
        'Could not read the source',
      );
      expect(document.getElementById('warnings-list')?.textContent).toContain(
        'The source could not be read.',
      );
      expect(document.getElementById('status')?.textContent).not.toContain(
        'private API detail',
      );
    }
  });
});

describe('createPopupController download boundary', () => {
  test('downloads an authorized complete result with exact CSV bytes and revokes after resolve', async () => {
    const document = shell();
    let resolveDownload: (value: number) => void = () => undefined;
    const download = vi.fn<
      (options: chrome.downloads.DownloadOptions) => Promise<number>
    >(
      () =>
        new Promise<number>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const createObjectUrl = vi.fn<(blob: Blob) => string>(
      () => 'blob:authorized',
    );
    const revokeObjectUrl = vi.fn();
    const controller = createPopupController(
      document,
      ports({ download, createObjectUrl, revokeObjectUrl }),
    );
    await controller.scan();
    const downloadPromise = controller.download();

    expect(download).toHaveBeenCalledTimes(1);
    const options = download.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      url: 'blob:authorized',
      filename: 'shopee-awb-sku-20260803-140509.csv',
      saveAs: true,
    });
    const blob = createObjectUrl.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('text/csv;charset=utf-8');
    const blobBytes = new Uint8Array(await blob!.arrayBuffer());
    expect(Array.from(blobBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(blobBytes.slice(3))).toBe(
      'SKU,Jumlah\r\n0001,2\r\n0002,3\r\n',
    );
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    resolveDownload(1);
    await downloadPromise;
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:authorized');
  });

  test('requires partial acknowledgement and revokes the URL after rejection', async () => {
    const document = shell();
    const download = vi.fn(async () => {
      throw new Error('private download detail');
    });
    const revokeObjectUrl = vi.fn();
    const controller = createPopupController(
      document,
      ports({
        requestScan: vi.fn<PopupPorts['requestScan']>(async () => ({
          type: 'SCAN_RESULT',
          result: result('partial'),
        })),
        download,
        revokeObjectUrl,
      }),
    );
    await controller.scan();
    await controller.download();
    expect(download).not.toHaveBeenCalled();
    controller.acknowledgePartial(true);
    await controller.download();
    expect(download).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:popup-test');
    expect(document.getElementById('status')?.textContent).toContain(
      'CSV download failed',
    );
    expect(document.getElementById('status')?.textContent).not.toContain(
      'private download detail',
    );

    await controller.download();
    expect(download).toHaveBeenCalledTimes(2);
  });

  test('never downloads non-downloadable statuses', async () => {
    for (const status of ['empty', 'inaccessible', 'unsupported'] as const) {
      const download = vi.fn(async () => 1);
      const controller = createPopupController(
        shell(),
        ports({
          requestScan: vi.fn<PopupPorts['requestScan']>(async () => ({
            type: 'SCAN_RESULT',
            result: result(status),
          })),
          download,
        }),
      );
      await controller.scan();
      await controller.download();
      expect(download).not.toHaveBeenCalled();
    }
  });
});
