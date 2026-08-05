import { describe, expect, test } from 'vitest';

import { buildScanResult, normalizeAdapterResult } from './scan-result.js';
import type { AdapterResult, ProductRow } from './types.js';

function row(
  sku: string,
  quantity: number,
  labelIndex = 1,
  source: ProductRow['source'] = 'pdf',
): ProductRow {
  return { sku, quantity, labelIndex, source };
}

describe('normalizeAdapterResult', () => {
  test('keeps valid rows and normalizes partial warnings exactly once', () => {
    const result = normalizeAdapterResult({
      status: 'partial',
      labelsInspected: 3,
      rows: [row('000-SYNTHETIC', 2)],
      warnings: [
        {
          code: 'MISSING_SKU',
          message: 'source-specific text',
          labelIndex: 2,
        },
        { code: 'PARTIAL_EXTRACTION', message: 'duplicate one' },
      ],
    });

    expect(result).toEqual({
      status: 'partial',
      labelsInspected: 3,
      rows: [row('000-SYNTHETIC', 2)],
      warnings: [
        {
          code: 'MISSING_SKU',
          message: 'A product row is missing a SKU.',
          labelIndex: 2,
        },
        {
          code: 'PARTIAL_EXTRACTION',
          message: 'Some product rows could not be extracted.',
        },
      ],
    });
    expect(
      result.warnings.filter(
        (warning) => warning.code === 'PARTIAL_EXTRACTION',
      ),
    ).toHaveLength(1);
  });

  test('filters invalid rows from a cast runtime value', () => {
    const result = normalizeAdapterResult({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        row('VALID', 1),
        null,
        { sku: '', quantity: 1, labelIndex: 1, source: 'pdf' },
        { sku: 'BAD-QTY', quantity: 0, labelIndex: 1, source: 'pdf' },
        { sku: 'BAD-LABEL', quantity: 1, labelIndex: 0, source: 'pdf' },
        { sku: 'BAD-SOURCE', quantity: 1, labelIndex: 1, source: 'other' },
      ],
      warnings: [
        { code: 'MISSING_SKU', message: 'ignored message' },
        { code: 'NOT_A_WARNING', message: 'ignored warning' },
      ],
    } as unknown as AdapterResult);

    expect(result.rows).toEqual([row('VALID', 1)]);
    expect(result.warnings).toEqual([
      { code: 'MISSING_SKU', message: 'A product row is missing a SKU.' },
    ]);
  });
});

describe('buildScanResult', () => {
  test('turns an empty partial result into a non-downloadable unsupported result', () => {
    expect(
      buildScanResult({
        status: 'partial',
        labelsInspected: 1,
        rows: [],
        warnings: [],
      }),
    ).toEqual({
      status: 'unsupported',
      labelsInspected: 1,
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [
        {
          code: 'UNSUPPORTED_LAYOUT',
          message: 'No supported product layout was recognized.',
        },
      ],
    });
  });

  test('composes complete result metrics from a synthetic adapter result', () => {
    expect(
      buildScanResult({
        status: 'complete',
        labelsInspected: 1,
        rows: [
          {
            sku: '000-SYNTHETIC',
            quantity: 2,
            labelIndex: 1,
            source: 'pdf',
          },
        ],
        warnings: [],
      }),
    ).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rowsDetected: 1,
      uniqueSkus: 1,
      totalQuantity: 2,
      rows: [row('000-SYNTHETIC', 2)],
      warnings: [],
    });
  });

  test('aggregates duplicate SKUs in first-seen order for partial results', () => {
    const result = buildScanResult({
      status: 'partial',
      labelsInspected: 2,
      rows: [row('FIRST', 2), row('SECOND', 1), row('FIRST', 3, 2)],
      warnings: [],
    });

    expect(result).toMatchObject({
      status: 'partial',
      labelsInspected: 2,
      rowsDetected: 3,
      uniqueSkus: 2,
      totalQuantity: 6,
      rows: [row('FIRST', 2), row('SECOND', 1), row('FIRST', 3, 2)],
    });
    expect(result.warnings).toEqual([
      {
        code: 'PARTIAL_EXTRACTION',
        message: 'Some product rows could not be extracted.',
      },
    ]);
  });

  test.each(['empty', 'inaccessible', 'unsupported'] as const)(
    'clears rows and aggregate metrics for non-downloadable %s results',
    (status) => {
      const result = buildScanResult({
        status,
        labelsInspected: 4,
        rows: [row('SHOULD-CLEAR', 9)],
        warnings: [],
      });

      expect(result).toMatchObject({
        status,
        labelsInspected: 4,
        rowsDetected: 0,
        uniqueSkus: 0,
        totalQuantity: 0,
        rows: [],
      });
      expect(result.warnings).toEqual(
        status === 'unsupported'
          ? [
              {
                code: 'UNSUPPORTED_LAYOUT',
                message: 'No supported product layout was recognized.',
              },
            ]
          : [],
      );
    },
  );

  test('maps aggregation overflow to a generic unsupported result without raw errors', () => {
    const result = buildScanResult({
      status: 'complete',
      labelsInspected: 1,
      rows: [row('OVERFLOW', Number.MAX_SAFE_INTEGER), row('OVERFLOW', 1, 2)],
      warnings: [],
    });

    expect(result).toEqual({
      status: 'unsupported',
      labelsInspected: 1,
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [
        {
          code: 'INVALID_QTY',
          message: 'A quantity is invalid or exceeds the supported range.',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('safe integer');
  });
});
