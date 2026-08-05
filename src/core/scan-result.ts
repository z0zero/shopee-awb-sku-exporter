import { aggregateRows, AggregationOverflowError } from './aggregate.js';
import type {
  AdapterResult,
  ExtractionWarning,
  ProductRow,
  ScanResult,
  ScanStatus,
  WarningCode,
} from './types.js';

const WARNING_MESSAGES: Record<WarningCode, string> = {
  MISSING_SKU: 'A product row is missing a SKU.',
  AMBIGUOUS_SKU: 'SKU data is ambiguous and was not selected.',
  INVALID_QTY: 'A quantity is invalid or exceeds the supported range.',
  INACCESSIBLE_SOURCE: 'The source could not be read.',
  UNSUPPORTED_LAYOUT: 'No supported product layout was recognized.',
  PARTIAL_EXTRACTION: 'Some product rows could not be extracted.',
};

function warning(code: WarningCode, labelIndex?: number): ExtractionWarning {
  return labelIndex === undefined
    ? { code, message: WARNING_MESSAGES[code] }
    : { code, message: WARNING_MESSAGES[code], labelIndex };
}

function isScanStatus(value: unknown): value is ScanStatus {
  return (
    value === 'complete' ||
    value === 'partial' ||
    value === 'empty' ||
    value === 'inaccessible' ||
    value === 'unsupported'
  );
}

function isWarningCode(value: unknown): value is WarningCode {
  return (
    value === 'MISSING_SKU' ||
    value === 'AMBIGUOUS_SKU' ||
    value === 'INVALID_QTY' ||
    value === 'INACCESSIBLE_SOURCE' ||
    value === 'UNSUPPORTED_LAYOUT' ||
    value === 'PARTIAL_EXTRACTION'
  );
}

function isValidRow(value: unknown): value is ProductRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ProductRow).sku === 'string' &&
    (value as ProductRow).sku.length > 0 &&
    Number.isSafeInteger((value as ProductRow).quantity) &&
    (value as ProductRow).quantity > 0 &&
    Number.isSafeInteger((value as ProductRow).labelIndex) &&
    (value as ProductRow).labelIndex > 0 &&
    ((value as ProductRow).source === 'dom' ||
      (value as ProductRow).source === 'pdf')
  );
}

function safeLabelIndex(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0
    ? value
    : undefined;
}

function normalizeWarnings(
  values: readonly ExtractionWarning[],
): ExtractionWarning[] {
  return values.flatMap((value) => {
    if (!isWarningCode(value.code)) {
      return [];
    }

    const labelIndex = safeLabelIndex(value.labelIndex);
    return [warning(value.code, labelIndex)];
  });
}

export function normalizeAdapterResult(value: AdapterResult): AdapterResult {
  const status = isScanStatus(value.status) ? value.status : 'unsupported';
  const labelsInspected =
    Number.isSafeInteger(value.labelsInspected) && value.labelsInspected >= 0
      ? value.labelsInspected
      : 0;
  const rows = Array.isArray(value.rows)
    ? value.rows.filter(isValidRow).map((row) => ({ ...row }))
    : [];
  const warnings = normalizeWarnings(value.warnings);
  const normalizedStatus =
    status === 'partial' && rows.length === 0 ? 'unsupported' : status;
  const safeRows =
    normalizedStatus === 'complete' || normalizedStatus === 'partial'
      ? rows
      : [];
  const safeWarnings =
    normalizedStatus === 'partial' &&
    !warnings.some((item) => item.code === 'PARTIAL_EXTRACTION')
      ? [...warnings, warning('PARTIAL_EXTRACTION')]
      : normalizedStatus === 'unsupported' && warnings.length === 0
        ? [warning('UNSUPPORTED_LAYOUT')]
        : warnings;

  return {
    status: normalizedStatus,
    labelsInspected,
    rows: safeRows,
    warnings: safeWarnings,
  };
}

export function buildScanResult(value: AdapterResult): ScanResult {
  const adapter = normalizeAdapterResult(value);

  if (adapter.status !== 'complete' && adapter.status !== 'partial') {
    return {
      status: adapter.status,
      labelsInspected: adapter.labelsInspected,
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: adapter.warnings,
    };
  }

  try {
    const aggregate = aggregateRows(adapter.rows);
    return {
      status: adapter.status,
      labelsInspected: adapter.labelsInspected,
      rowsDetected: adapter.rows.length,
      uniqueSkus: aggregate.uniqueSkus,
      totalQuantity: aggregate.totalQuantity,
      rows: adapter.rows,
      warnings: adapter.warnings,
    };
  } catch (error) {
    if (error instanceof AggregationOverflowError) {
      return {
        status: 'unsupported',
        labelsInspected: adapter.labelsInspected,
        rowsDetected: 0,
        uniqueSkus: 0,
        totalQuantity: 0,
        rows: [],
        warnings: [warning('INVALID_QTY')],
      };
    }

    return {
      status: 'inaccessible',
      labelsInspected: 0,
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [warning('INACCESSIBLE_SOURCE')],
    };
  }
}
