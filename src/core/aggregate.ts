import type { AggregationResult, ProductRow } from './types.js';

export class AggregationOverflowError extends Error {
  constructor() {
    super('Quantity aggregate exceeds JavaScript safe integer range.');
    this.name = 'AggregationOverflowError';
  }
}

export function aggregateRows(rows: readonly ProductRow[]): AggregationResult {
  const quantityBySku = new Map<string, number>();
  let totalQuantity = 0;

  for (const row of rows) {
    const nextSkuQuantity = (quantityBySku.get(row.sku) ?? 0) + row.quantity;
    if (!Number.isSafeInteger(nextSkuQuantity)) {
      throw new AggregationOverflowError();
    }

    const nextTotalQuantity = totalQuantity + row.quantity;
    if (!Number.isSafeInteger(nextTotalQuantity)) {
      throw new AggregationOverflowError();
    }

    quantityBySku.set(row.sku, nextSkuQuantity);
    totalQuantity = nextTotalQuantity;
  }

  return {
    rows: Array.from(quantityBySku, ([sku, quantity]) => ({ sku, quantity })),
    uniqueSkus: quantityBySku.size,
    totalQuantity,
  };
}
