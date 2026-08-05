import { describe, expect, test } from 'vitest';

import {
  allInvalidRowsMarkup,
  completeLabelTablesMarkup,
  duplicateSkuAnchorMarkup,
  duplicateSkuCellFallbackMarkup,
  missingAnchorsMarkup,
  parseSyntheticDom,
  partialMalformedRowsMarkup,
  recognizedEmptyTableMarkup,
  roleGridMarkup,
  roleTableMarkup,
  rowLikeAriaFallbackMarkup,
} from '../../tests/fixtures/dom.js';
import { extractDomRows } from './dom.js';
import type { AdapterResult, WarningCode } from '../core/types.js';

function warningCodes(result: AdapterResult): WarningCode[] {
  return result.warnings.map((warning) => warning.code);
}

describe('extractDomRows', () => {
  test('returns complete DOM rows from label tables in one-based document order', () => {
    const root = parseSyntheticDom(completeLabelTablesMarkup());

    const result = extractDomRows(root, { labelIndexOffset: 4 });

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 2,
      rows: [
        {
          sku: '000123-AB.C/7',
          quantity: 2,
          labelIndex: 5,
          source: 'dom',
        },
        {
          sku: 'SKU,WITH.PUNCT/02',
          quantity: 1,
          labelIndex: 5,
          source: 'dom',
        },
        {
          sku: '000123-AB.C/7',
          quantity: 3,
          labelIndex: 6,
          source: 'dom',
        },
      ],
      warnings: [],
    });
  });

  test('extracts role table and role grid candidates in document order', () => {
    const root = parseSyntheticDom(`${roleTableMarkup()}${roleGridMarkup()}`);

    const result = extractDomRows(root);

    expect(result.status).toBe('complete');
    expect(result.labelsInspected).toBe(2);
    expect(result.rows).toEqual([
      {
        sku: 'ROLE-TABLE-001',
        quantity: 4,
        labelIndex: 1,
        source: 'dom',
      },
      {
        sku: 'GRID-SKU.02',
        quantity: 5,
        labelIndex: 2,
        source: 'dom',
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  test('uses only same-row explicit ARIA SKU and Qty labels for row-like fallback extraction', () => {
    const root = parseSyntheticDom(rowLikeAriaFallbackMarkup());

    const result = extractDomRows(root);

    expect(result).toEqual({
      status: 'complete',
      labelsInspected: 1,
      rows: [
        {
          sku: 'ARIA-FALLBACK-01',
          quantity: 6,
          labelIndex: 1,
          source: 'dom',
        },
      ],
      warnings: [],
    });
  });

  test('returns partial with one partial warning and no invented rows when some candidates are rejected', () => {
    const root = parseSyntheticDom(partialMalformedRowsMarkup());

    const result = extractDomRows(root);

    expect(result.status).toBe('partial');
    expect(result.labelsInspected).toBe(1);
    expect(result.rows).toEqual([
      {
        sku: 'VALID-SKU-01',
        quantity: 2,
        labelIndex: 1,
        source: 'dom',
      },
    ]);
    expect(warningCodes(result)).toEqual([
      'MISSING_SKU',
      'INVALID_QTY',
      'INVALID_QTY',
      'INVALID_QTY',
      'PARTIAL_EXTRACTION',
    ]);
    expect(result.warnings.map((warning) => warning.labelIndex)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    const warningText = result.warnings
      .map((warning) => warning.message)
      .join(' ');
    expect(warningText).not.toContain('VALID-SKU-01');
    expect(warningText).not.toContain('ZERO-QTY-SKU');
    expect(warningText).not.toContain('NEGATIVE-QTY-SKU');
    expect(warningText).not.toContain('DECIMAL-QTY-SKU');
    expect(warningText).not.toContain('1.5');
    expect(warningText).not.toContain('-1');
  });

  test('returns empty for a recognized table with no candidate rows', () => {
    const root = parseSyntheticDom(recognizedEmptyTableMarkup());

    const result = extractDomRows(root);

    expect(result).toEqual({
      status: 'empty',
      labelsInspected: 1,
      rows: [],
      warnings: [],
    });
  });

  test('returns unsupported without invented rows when all candidate rows are invalid', () => {
    const root = parseSyntheticDom(allInvalidRowsMarkup());

    const result = extractDomRows(root);

    expect(result.status).toBe('unsupported');
    expect(result.labelsInspected).toBe(1);
    expect(result.rows).toEqual([]);
    expect(warningCodes(result)).toEqual(['MISSING_SKU', 'INVALID_QTY']);
  });

  test('returns unsupported when product anchors are missing', () => {
    const root = parseSyntheticDom(missingAnchorsMarkup());

    const result = extractDomRows(root);

    expect(result).toEqual({
      status: 'unsupported',
      labelsInspected: 1,
      rows: [],
      warnings: [
        {
          code: 'UNSUPPORTED_LAYOUT',
          message: 'Required product table anchors are missing.',
          labelIndex: 1,
        },
      ],
    });
  });

  test('returns unsupported when SKU anchors or same-row SKU cells are ambiguous', () => {
    const duplicateAnchorResult = extractDomRows(
      parseSyntheticDom(duplicateSkuAnchorMarkup()),
    );
    const duplicateCellResult = extractDomRows(
      parseSyntheticDom(duplicateSkuCellFallbackMarkup()),
    );

    expect(duplicateAnchorResult.status).toBe('unsupported');
    expect(duplicateAnchorResult.rows).toEqual([]);
    expect(warningCodes(duplicateAnchorResult)).toEqual(['AMBIGUOUS_SKU']);
    expect(duplicateCellResult.status).toBe('unsupported');
    expect(duplicateCellResult.rows).toEqual([]);
    expect(warningCodes(duplicateCellResult)).toEqual(['AMBIGUOUS_SKU']);
  });
});
