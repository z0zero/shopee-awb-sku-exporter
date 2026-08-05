import type {
  ExtractionWarning,
  ProductRow,
  ScanResult,
  ScanStatus,
  WarningCode,
} from '../core/types.js';

export type ScanRequest = { type: 'SCAN_REQUEST' };
export type ScanResponse = { type: 'SCAN_RESULT'; result: ScanResult };

const SCAN_STATUSES: readonly ScanStatus[] = [
  'complete',
  'partial',
  'empty',
  'inaccessible',
  'unsupported',
];
const WARNING_CODES: readonly WarningCode[] = [
  'MISSING_SKU',
  'AMBIGUOUS_SKU',
  'INVALID_QTY',
  'INACCESSIBLE_SOURCE',
  'UNSUPPORTED_LAYOUT',
  'PARTIAL_EXTRACTION',
];
const WARNING_MESSAGES: Record<WarningCode, string> = {
  MISSING_SKU: 'A product row is missing a SKU.',
  AMBIGUOUS_SKU: 'SKU data is ambiguous and was not selected.',
  INVALID_QTY: 'A quantity is invalid or exceeds the supported range.',
  INACCESSIBLE_SOURCE: 'The source could not be read.',
  UNSUPPORTED_LAYOUT: 'No supported product layout was recognized.',
  PARTIAL_EXTRACTION: 'Some product rows could not be extracted.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const expected = new Set(keys);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function isProductRow(value: unknown): value is ProductRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    hasExactKeys(value, ['sku', 'quantity', 'labelIndex', 'source']) &&
    typeof value.sku === 'string' &&
    value.sku.length > 0 &&
    isNonNegativeSafeInteger(value.quantity) &&
    value.quantity > 0 &&
    isNonNegativeSafeInteger(value.labelIndex) &&
    value.labelIndex > 0 &&
    (value.source === 'dom' || value.source === 'pdf')
  );
}

function isWarning(value: unknown): value is ExtractionWarning {
  if (!isRecord(value)) {
    return false;
  }

  const hasLabelIndex = hasExactKeys(value, ['code', 'message', 'labelIndex']);
  const hasNoLabelIndex = hasExactKeys(value, ['code', 'message']);
  if (
    (!hasLabelIndex && !hasNoLabelIndex) ||
    !WARNING_CODES.includes(value.code as WarningCode) ||
    typeof value.message !== 'string' ||
    value.message !== WARNING_MESSAGES[value.code as WarningCode]
  ) {
    return false;
  }

  return (
    !hasLabelIndex ||
    (isNonNegativeSafeInteger(value.labelIndex) && value.labelIndex > 0)
  );
}

function isScanResult(value: unknown): value is ScanResult {
  if (!isRecord(value)) {
    return false;
  }

  if (!(
    hasExactKeys(value, [
      'status',
      'labelsInspected',
      'rowsDetected',
      'uniqueSkus',
      'totalQuantity',
      'rows',
      'warnings',
    ]) &&
    SCAN_STATUSES.includes(value.status as ScanStatus) &&
    isNonNegativeSafeInteger(value.labelsInspected) &&
    isNonNegativeSafeInteger(value.rowsDetected) &&
    isNonNegativeSafeInteger(value.uniqueSkus) &&
    isNonNegativeSafeInteger(value.totalQuantity) &&
    Array.isArray(value.rows) &&
    Array.isArray(value.warnings)
  )) {
    return false;
  }

  const rows = value.rows;
  if (!rows.every(isProductRow) || !value.warnings.every(isWarning)) {
    return false;
  }

  const uniqueSkus = new Set(rows.map((row) => row.sku));
  const totalQuantity = rows.reduce((total, row) => total + row.quantity, 0);
  const hasValidCounters =
    value.rowsDetected === rows.length &&
    value.uniqueSkus === uniqueSkus.size &&
    Number.isSafeInteger(totalQuantity) &&
    value.totalQuantity === totalQuantity;

  if (!hasValidCounters) {
    return false;
  }

  if (value.status === 'complete') {
    return rows.length > 0 && value.warnings.length === 0;
  }

  if (value.status === 'partial') {
    return (
      rows.length > 0 &&
      value.warnings.some((warning) => warning.code === 'PARTIAL_EXTRACTION')
    );
  }

  return (
    rows.length === 0 &&
    value.rowsDetected === 0 &&
    value.uniqueSkus === 0 &&
    value.totalQuantity === 0
  );
}

export function isScanRequest(value: unknown): value is ScanRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['type']) &&
    value.type === 'SCAN_REQUEST'
  );
}

export function isScanResponse(value: unknown): value is ScanResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['type', 'result']) &&
    value.type === 'SCAN_RESULT' &&
    isScanResult(value.result)
  );
}
