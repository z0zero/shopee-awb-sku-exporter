import { describe, expect, test } from 'vitest';

import { aggregateRows, AggregationOverflowError } from './aggregate.js';
import type { ProductRow, ProductSource } from './types.js';

function row(
  sku: string,
  quantity: number,
  labelIndex: number,
  source: ProductSource,
): ProductRow {
  return { sku, quantity, labelIndex, source };
}

describe('aggregateRows', () => {
  test('sums duplicate DOM rows in first-seen SKU order without mutating input', () => {
    const rows = [
      row('001-ABC', 2, 1, 'dom'),
      row('ABC,2', 1, 1, 'dom'),
      row('001-ABC', 3, 2, 'dom'),
    ];
    const originalRows = rows.map((productRow) => ({ ...productRow }));

    expect(aggregateRows(rows)).toEqual({
      rows: [
        { sku: '001-ABC', quantity: 5 },
        { sku: 'ABC,2', quantity: 1 },
      ],
      uniqueSkus: 2,
      totalQuantity: 6,
    });
    expect(rows).toEqual(originalRows);
  });

  test('sums duplicate PDF rows in first-seen SKU order without mutating input', () => {
    const rows = [
      row('001-ABC', 2, 1, 'pdf'),
      row('ABC,2', 1, 1, 'pdf'),
      row('001-ABC', 3, 2, 'pdf'),
    ];
    const originalRows = rows.map((productRow) => ({ ...productRow }));

    expect(aggregateRows(rows)).toEqual({
      rows: [
        { sku: '001-ABC', quantity: 5 },
        { sku: 'ABC,2', quantity: 1 },
      ],
      uniqueSkus: 2,
      totalQuantity: 6,
    });
    expect(rows).toEqual(originalRows);
  });

  test('throws AggregationOverflowError before returning an unsafe duplicate-SKU sum', () => {
    const rows = [
      row('001-ABC', Number.MAX_SAFE_INTEGER, 1, 'dom'),
      row('001-ABC', 1, 2, 'dom'),
    ];

    expect(() => aggregateRows(rows)).toThrow(AggregationOverflowError);
  });

  test('throws AggregationOverflowError before returning an unsafe cross-SKU total', () => {
    const rows = [
      row('001-ABC', Number.MAX_SAFE_INTEGER, 1, 'pdf'),
      row('ABC,2', 1, 2, 'pdf'),
    ];

    expect(() => aggregateRows(rows)).toThrow(AggregationOverflowError);
  });
});
