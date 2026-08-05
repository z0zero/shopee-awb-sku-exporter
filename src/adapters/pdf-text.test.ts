import { describe, expect, test } from 'vitest';

import {
  adjacentColumnCrossesSkuBandPdfDocument,
  ambiguousWideSkuOriginPdfDocument,
  closeMalformedBodyRowPdfDocument,
  completePositionedPdfDocument,
  closeProductVariationContinuationPdfDocument,
  duplicateSkuHeaderPdfDocument,
  mergedSkuOriginWithTrailingQtyPdfDocument,
  malformedRowsPdfDocument,
  missingHeaderPdfDocument,
  onlyUnreadablePagesPdfDocument,
  splitSkuContinuationPdfDocument,
  splitSkuContinuationAcrossSkuBandPdfDocument,
  skuContinuationWithWrappedProductPdfDocument,
  unmatchedBodyContentPdfDocument,
  unreadablePageWithReadableRowsPdfDocument,
  wideSkuOriginIntoVariationPdfDocument,
  wideSkuOriginWithIndependentQtyPdfDocument,
  wideFooterOriginPdfDocument,
  wrappedProductAndFooterPdfDocument,
} from '../../tests/fixtures/pdf-text.js';
import { extractPdfTextRows } from './pdf-text.js';
import type { AdapterResult, WarningCode } from '../core/types.js';

function warningCodes(result: AdapterResult): WarningCode[] {
  return result.warnings.map((warning) => warning.code);
}

describe('extractPdfTextRows', () => {
  test('returns complete PDF rows in page and visual order without flattening columns', () => {
    const result = extractPdfTextRows(completePositionedPdfDocument());

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 2,
      rows: [
        {
          sku: '000123-AB.C/7',
          quantity: 2,
          labelIndex: 1,
          source: 'pdf',
        },
        {
          sku: 'SKU,WITH.PUNCT/02',
          quantity: 1,
          labelIndex: 1,
          source: 'pdf',
        },
        {
          sku: '000123-AB.C/7',
          quantity: 3,
          labelIndex: 2,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('returns unsupported without invented rows when required PDF anchors are missing or duplicated', () => {
    const missingHeaderResult = extractPdfTextRows(missingHeaderPdfDocument());
    const duplicateSkuResult = extractPdfTextRows(
      duplicateSkuHeaderPdfDocument(),
    );

    expect(missingHeaderResult.status).toBe('unsupported');
    expect(missingHeaderResult.rows).toEqual([]);
    expect(warningCodes(missingHeaderResult)).toEqual(['UNSUPPORTED_LAYOUT']);
    expect(duplicateSkuResult.status).toBe('unsupported');
    expect(duplicateSkuResult.rows).toEqual([]);
    expect(warningCodes(duplicateSkuResult)).toEqual(['AMBIGUOUS_SKU']);
  });

  test('returns partial with generic warnings and no guessed rows for malformed PDF body groups', () => {
    const result = extractPdfTextRows(malformedRowsPdfDocument());

    expect(result.status).toBe('partial');
    expect(result.labelsInspected).toBe(1);
    expect(result.rows).toEqual([
      {
        sku: 'VALID-SKU-01',
        quantity: 2,
        labelIndex: 1,
        source: 'pdf',
      },
    ]);
    expect(warningCodes(result)).toEqual([
      'MISSING_SKU',
      'AMBIGUOUS_SKU',
      'INVALID_QTY',
      'INVALID_QTY',
      'INVALID_QTY',
      'INVALID_QTY',
      'INVALID_QTY',
      'INVALID_QTY',
      'UNSUPPORTED_LAYOUT',
      'PARTIAL_EXTRACTION',
    ]);
    expect(result.warnings.every((warning) => warning.labelIndex === 1)).toBe(
      true,
    );

    const warningText = result.warnings
      .map((warning) => warning.message)
      .join(' ');
    expect(warningText).not.toContain('VALID-SKU-01');
    expect(warningText).not.toContain('FIRST-SKU');
    expect(warningText).not.toContain('SECOND-SKU');
    expect(warningText).not.toContain('SPANNING-SKU 2');
    expect(warningText).not.toContain('1.5');
    expect(warningText).not.toContain('-1');
    expect(warningText).not.toContain('x2');
  });

  test('preserves unreadable page failures and keeps readable rows partial', () => {
    const result = extractPdfTextRows(
      unreadablePageWithReadableRowsPdfDocument(),
    );

    expect(result.status).toBe('partial');
    expect(result.rows).toEqual([
      {
        sku: 'VALID-PAGE-SKU',
        quantity: 4,
        labelIndex: 1,
        source: 'pdf',
      },
    ]);
    expect(warningCodes(result)).toEqual([
      'INACCESSIBLE_SOURCE',
      'PARTIAL_EXTRACTION',
    ]);
    expect(result.warnings.map((warning) => warning.labelIndex)).toEqual([
      2, 2,
    ]);
  });

  test('returns inaccessible when every available PDF page failed before readable rows', () => {
    const result = extractPdfTextRows(onlyUnreadablePagesPdfDocument());

    expect(result).toEqual({
      status: 'inaccessible',
      labelsInspected: 1,
      rows: [],
      warnings: [
        {
          code: 'INACCESSIBLE_SOURCE',
          message: 'A PDF page could not be read.',
          labelIndex: 1,
        },
      ],
    });
  });

  test('prevents a complete result when body content exists without isolated SKU or Qty bands', () => {
    const result = extractPdfTextRows(unmatchedBodyContentPdfDocument());

    expect(result.status).toBe('partial');
    expect(result.rows).toEqual([
      {
        sku: 'VALID-SKU-01',
        quantity: 1,
        labelIndex: 1,
        source: 'pdf',
      },
    ]);
    expect(warningCodes(result)).toEqual([
      'UNSUPPORTED_LAYOUT',
      'PARTIAL_EXTRACTION',
    ]);
  });

  test('accepts chained wide product continuations and stops at a mixed-case Pesan footer', () => {
    const result = extractPdfTextRows(wrappedProductAndFooterPdfDocument());

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: 'WRAPPED-VALID-01',
          quantity: 1,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('stops at a wide Pesan footer based on its product-column origin', () => {
    const result = extractPdfTextRows(wideFooterOriginPdfDocument());

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: 'WIDE-FOOTER-VALID-01',
          quantity: 1,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('rejects adjacent-column text that only crosses into the SKU band', () => {
    const result = extractPdfTextRows(
      adjacentColumnCrossesSkuBandPdfDocument(),
    );

    expect(result.status).toBe('unsupported');
    expect(result.rows).toEqual([]);
    expect(warningCodes(result)).toEqual(['MISSING_SKU']);

    const warningText = result.warnings
      .map((warning) => warning.message)
      .join(' ');
    expect(warningText).not.toContain('Variant cell crosses midpoint');
  });

  test('does not hide a distinct malformed body row as wrapped product text', () => {
    const result = extractPdfTextRows(closeMalformedBodyRowPdfDocument());

    expect(result.status).toBe('partial');
    expect(result.rows).toEqual([
      {
        sku: 'VALID-SKU-01',
        quantity: 1,
        labelIndex: 1,
        source: 'pdf',
      },
    ]);
    expect(warningCodes(result)).toEqual([
      'MISSING_SKU',
      'INVALID_QTY',
      'PARTIAL_EXTRACTION',
    ]);
  });

  test('ignores a close product and variation continuation after a valid row', () => {
    const result = extractPdfTextRows(
      closeProductVariationContinuationPdfDocument(),
    );

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: 'CLOSE-CONTINUATION-01',
          quantity: 1,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('recovers the leading SKU token from a wide SKU-origin item with independent Qty evidence', () => {
    const result = extractPdfTextRows(
      wideSkuOriginWithIndependentQtyPdfDocument(),
    );

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: '001-WIDE-SKU/07',
          quantity: 3,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('recovers a trailing Qty from a merged SKU-origin item with middle title tokens', () => {
    const result = extractPdfTextRows(
      mergedSkuOriginWithTrailingQtyPdfDocument(),
    );

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: '001-MERGED-SKU/09',
          quantity: 2,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('trims the leading SKU token when a wide SKU-origin item reaches variation only', () => {
    const result = extractPdfTextRows(wideSkuOriginIntoVariationPdfDocument());

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: '001-WIDE-VARIATION-SKU/07',
          quantity: 3,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('fails closed when a wide SKU-origin item has no unambiguous token boundary', () => {
    const result = extractPdfTextRows(ambiguousWideSkuOriginPdfDocument());

    expect(result.status).toBe('unsupported');
    expect(result.rows).toEqual([]);
    expect(warningCodes(result)).toEqual(['AMBIGUOUS_SKU']);
  });

  test('joins a close SKU-column continuation group without creating a warning or extra row', () => {
    const result = extractPdfTextRows(splitSkuContinuationPdfDocument());

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: 'SPLIT-SYNTH-42',
          quantity: 1,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('joins a continuation when the previous SKU fragment slightly crosses the SKU band', () => {
    const result = extractPdfTextRows(
      splitSkuContinuationAcrossSkuBandPdfDocument(),
    );

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: 'SPLIT-CROSS-42',
          quantity: 1,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });

  test('joins a SKU continuation with one wrapped product item and chained product lines', () => {
    const result = extractPdfTextRows(
      skuContinuationWithWrappedProductPdfDocument(),
    );

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: 'SPLIT-WRAPPED-42',
          quantity: 1,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [],
    });
  });
});
