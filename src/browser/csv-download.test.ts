import { describe, expect, test, vi } from 'vitest';

import { buildScanResult } from '../core/scan-result.js';
import type { ScanResult } from '../core/types.js';
import { downloadScanCsv, type CsvDownloadPorts } from './csv-download.js';

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
    warnings: [],
    ...overrides,
  };
}

function ports(overrides: Partial<CsvDownloadPorts> = {}): CsvDownloadPorts {
  return {
    download: vi.fn(async () => 1),
    createObjectUrl: vi.fn(() => 'blob:csv-test'),
    revokeObjectUrl: vi.fn(),
    now: vi.fn(() => new Date(2026, 7, 3, 14, 5, 9)),
    ...overrides,
  };
}

describe('downloadScanCsv', () => {
  test('does not download an acknowledged empty partial result', async () => {
    const download = vi.fn(async () => 1);
    const createObjectUrl = vi.fn(() => 'blob:should-not-exist');
    const scan = buildScanResult({
      status: 'partial',
      labelsInspected: 1,
      rows: [],
      warnings: [],
    });

    await expect(
      downloadScanCsv(scan, true, ports({ download, createObjectUrl })),
    ).resolves.toBe('unavailable');
    expect(download).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  test('defensively rejects a manually constructed empty partial result', async () => {
    const download = vi.fn(async () => 1);
    const createObjectUrl = vi.fn(() => 'blob:should-not-exist');

    await expect(
      downloadScanCsv(
        result('partial', {
          rowsDetected: 0,
          uniqueSkus: 0,
          totalQuantity: 0,
          rows: [],
          warnings: [
            {
              code: 'PARTIAL_EXTRACTION',
              message: 'Some product rows could not be extracted.',
            },
          ],
        }),
        true,
        ports({ download, createObjectUrl }),
      ),
    ).resolves.toBe('unavailable');
    expect(download).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  test('starts a complete CSV download with exact bytes and timestamp', async () => {
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
    const downloadPromise = downloadScanCsv(
      result('complete'),
      false,
      ports({ download, createObjectUrl, revokeObjectUrl }),
    );

    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]?.[0]).toMatchObject({
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
    await expect(downloadPromise).resolves.toBe('started');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:authorized');
  });

  test('requires acknowledgement before downloading a partial result', async () => {
    const download = vi.fn(async () => 1);

    await expect(
      downloadScanCsv(result('partial'), false, ports({ download })),
    ).resolves.toBe('acknowledgement-required');
    expect(download).not.toHaveBeenCalled();
  });

  test('reports failure and revokes the URL when an acknowledged download rejects', async () => {
    const download = vi.fn(async () => {
      throw new Error('private download detail');
    });
    const revokeObjectUrl = vi.fn();

    await expect(
      downloadScanCsv(
        result('partial'),
        true,
        ports({ download, revokeObjectUrl }),
      ),
    ).resolves.toBe('failed');
    expect(download).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:csv-test');
  });

  test('does not create a URL or download an unsupported result', async () => {
    const download = vi.fn(async () => 1);
    const createObjectUrl = vi.fn(() => 'blob:should-not-exist');

    await expect(
      downloadScanCsv(
        result('unsupported'),
        false,
        ports({ download, createObjectUrl }),
      ),
    ).resolves.toBe('unavailable');
    expect(download).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
