import { describe, expect, test } from 'vitest';

import { isScanRequest, isScanResponse } from './messages.js';

const completeResult = {
  status: 'complete',
  labelsInspected: 1,
  rowsDetected: 1,
  uniqueSkus: 1,
  totalQuantity: 2,
  rows: [{ sku: '0001', quantity: 2, labelIndex: 1, source: 'dom' }],
  warnings: [],
} as const;

const partialResult = {
  ...completeResult,
  status: 'partial',
  warnings: [
    {
      code: 'PARTIAL_EXTRACTION',
      message: 'Some product rows could not be extracted.',
    },
  ],
} as const;

const zeroResult = {
  status: 'empty',
  labelsInspected: 1,
  rowsDetected: 0,
  uniqueSkus: 0,
  totalQuantity: 0,
  rows: [],
  warnings: [],
} as const;

describe('runtime message guards', () => {
  test('accepts only the exact scan request shape', () => {
    expect(isScanRequest({ type: 'SCAN_REQUEST' })).toBe(true);
    expect(isScanRequest({ type: 'SCAN_REQUEST', extra: true })).toBe(false);
    expect(isScanRequest({ type: 'OTHER' })).toBe(false);
    expect(isScanRequest(null)).toBe(false);
  });

  test('accepts a validated scan response and rejects malformed nested data', () => {
    expect(
      isScanResponse({ type: 'SCAN_RESULT', result: completeResult }),
    ).toBe(true);
    expect(
      isScanResponse({
        type: 'SCAN_RESULT',
        result: { ...completeResult, totalQuantity: Number.POSITIVE_INFINITY },
      }),
    ).toBe(false);
    expect(
      isScanResponse({
        type: 'SCAN_RESULT',
        result: {
          ...completeResult,
          warnings: [{ code: 'INTERNAL', message: 'secret' }],
        },
      }),
    ).toBe(false);
    expect(
      isScanResponse({ type: 'SCAN_RESULT', result: completeResult, extra: 1 }),
    ).toBe(false);
  });

  test('accepts zero-row statuses with inspected labels', () => {
    for (const status of ['empty', 'inaccessible', 'unsupported'] as const) {
      expect(
        isScanResponse({
          type: 'SCAN_RESULT',
          result: {
            ...zeroResult,
            status,
          },
        }),
      ).toBe(true);
    }
  });

  test('rejects rows and nonzero aggregate counters for zero-row statuses', () => {
    for (const status of ['empty', 'inaccessible', 'unsupported'] as const) {
      expect(
        isScanResponse({
          type: 'SCAN_RESULT',
          result: { ...zeroResult, status, rowsDetected: 1 },
        }),
      ).toBe(false);
      expect(
        isScanResponse({
          type: 'SCAN_RESULT',
          result: { ...zeroResult, status, uniqueSkus: 1 },
        }),
      ).toBe(false);
      expect(
        isScanResponse({
          type: 'SCAN_RESULT',
          result: { ...zeroResult, status, totalQuantity: 1 },
        }),
      ).toBe(false);
      expect(
        isScanResponse({
          type: 'SCAN_RESULT',
          result: {
            ...zeroResult,
            status,
            rowsDetected: 1,
            uniqueSkus: 1,
            totalQuantity: 2,
            rows: completeResult.rows,
          },
        }),
      ).toBe(false);
    }

    expect(
      isScanResponse({
        type: 'SCAN_RESULT',
        result: { ...partialResult, warnings: [] },
      }),
    ).toBe(false);
    expect(isScanResponse({ type: 'SCAN_RESULT', result: partialResult })).toBe(
      true,
    );
    expect(
      isScanResponse({
        type: 'SCAN_RESULT',
        result: {
          ...completeResult,
          warnings: [
            {
              code: 'PARTIAL_EXTRACTION',
              message: 'Some product rows could not be extracted.',
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isScanResponse({
        type: 'SCAN_RESULT',
        result: {
          ...completeResult,
          rowsDetected: 0,
          uniqueSkus: 0,
          totalQuantity: 0,
          rows: [],
        },
      }),
    ).toBe(false);

    expect(
      isScanResponse({
        type: 'SCAN_RESULT',
        result: {
          ...partialResult,
          rowsDetected: 0,
          uniqueSkus: 0,
          totalQuantity: 0,
          rows: [],
        },
      }),
    ).toBe(false);
  });
});
