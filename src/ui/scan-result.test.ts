import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';

import type { ScanResult } from '../core/types.js';
import {
  deriveScanViewModel,
  renderScanView,
  scanResultElementIds,
} from './scan-result.js';

function result(
  status: ScanResult['status'],
  overrides: Partial<ScanResult> = {},
): ScanResult {
  return {
    status,
    labelsInspected: 2,
    rowsDetected: 3,
    uniqueSkus: 2,
    totalQuantity: 5,
    rows: [
      { sku: 'A', quantity: 2, labelIndex: 1, source: 'dom' },
      { sku: 'B', quantity: 3, labelIndex: 2, source: 'dom' },
    ],
    warnings: [],
    ...overrides,
  };
}

function shell(): Document {
  return new JSDOM(`
    <main>
      <p id="status"></p>
      <ul id="summary-list"></ul>
      <ul id="warnings-list"></ul>
      <label id="partial-acknowledgement-label"><input id="partial-acknowledgement" type="checkbox"></label>
      <button id="download-button" type="button"></button>
    </main>
  `).window.document;
}

describe('deriveScanViewModel', () => {
  test('shows ready copy for each scan surface', () => {
    expect(deriveScanViewModel(null, false, 'awb').statusText).toBe(
      'Ready to scan.',
    );
    expect(deriveScanViewModel(null, false, 'local-pdf').statusText).toBe(
      'Choose a downloaded Shopee AWB PDF.',
    );
  });

  test('shows complete summary metrics and enables CSV download', () => {
    expect(deriveScanViewModel(result('complete'), false, 'awb')).toEqual({
      statusText: 'Scan complete.',
      summaryLines: [
        'Labels inspected: 2',
        'Product rows: 3',
        'Unique SKUs: 2',
        'Total quantity: 5',
      ],
      warningLines: [],
      showAcknowledgement: false,
      canDownload: true,
      downloadLabel: 'Download CSV',
    });
  });

  test('shows every partial warning and gates download on acknowledgement', () => {
    const partial = result('partial', {
      warnings: [
        { code: 'MISSING_SKU', message: 'A product row is missing a SKU.' },
        {
          code: 'INVALID_QTY',
          message: 'A quantity is invalid or exceeds the supported range.',
          labelIndex: 4,
        },
      ],
    });

    expect(deriveScanViewModel(partial, false, 'awb')).toMatchObject({
      summaryLines: [
        'Labels inspected: 2',
        'Product rows: 3',
        'Unique SKUs: 2',
        'Total quantity: 5',
      ],
      warningLines: [
        'A product row is missing a SKU.',
        'A quantity is invalid or exceeds the supported range. (Label 4)',
      ],
      showAcknowledgement: true,
      canDownload: false,
      downloadLabel: 'Download partial result',
    });
    expect(deriveScanViewModel(partial, true, 'local-pdf').canDownload).toBe(
      true,
    );
  });

  test('preserves non-downloadable status rules on both surfaces', () => {
    for (const surface of ['awb', 'local-pdf'] as const) {
      for (const status of ['empty', 'inaccessible', 'unsupported'] as const) {
        const model = deriveScanViewModel(result(status), false, surface);
        expect(model.canDownload).toBe(false);
        expect(model.showAcknowledgement).toBe(false);
      }
    }

    expect(
      deriveScanViewModel(result('unsupported'), false, 'awb').statusText,
    ).toContain('Open an AWB route');
    expect(
      deriveScanViewModel(result('unsupported'), false, 'local-pdf').statusText,
    ).toContain('supported product table');
    expect(
      deriveScanViewModel(result('inaccessible'), false, 'awb').statusText,
    ).toContain('Wait and retry');
    expect(deriveScanViewModel(result('empty'), false, 'awb').statusText).toContain(
      'Verify the print document',
    );
  });
});

describe('renderScanView', () => {
  test('writes summary and warning content as text without creating markup', () => {
    const document = shell();
    renderScanView(
      {
        statusText: 'Review',
        summaryLines: ['<b>One</b>'],
        warningLines: ['<img src=x onerror=alert(1)>'],
        showAcknowledgement: true,
        canDownload: false,
        downloadLabel: 'Download partial result',
      },
      document,
    );

    expect(document.querySelector('img')).toBeNull();
    expect(document.getElementById(scanResultElementIds.summary)?.textContent).toBe(
      '<b>One</b>',
    );
    expect(document.getElementById(scanResultElementIds.warnings)?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
    const acknowledgement = document.getElementById(
      scanResultElementIds.acknowledgement,
    ) as HTMLInputElement;
    expect(acknowledgement.disabled).toBe(false);
    expect(acknowledgement.checked).toBe(false);
    expect(
      document.getElementById(scanResultElementIds.acknowledgementLabel)?.hidden,
    ).toBe(false);
    expect(
      (document.getElementById(scanResultElementIds.download) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
