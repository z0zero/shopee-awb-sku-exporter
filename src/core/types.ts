export type ProductSource = 'dom' | 'pdf';

export type WarningCode =
  | 'MISSING_SKU'
  | 'AMBIGUOUS_SKU'
  | 'INVALID_QTY'
  | 'INACCESSIBLE_SOURCE'
  | 'UNSUPPORTED_LAYOUT'
  | 'PARTIAL_EXTRACTION';

export type ScanStatus =
  'complete' | 'partial' | 'empty' | 'inaccessible' | 'unsupported';

export interface ProductRow {
  sku: string;
  quantity: number;
  labelIndex: number;
  source: ProductSource;
}

export interface ExtractionWarning {
  code: WarningCode;
  message: string;
  labelIndex?: number;
}

export interface AdapterResult {
  status: ScanStatus;
  labelsInspected: number;
  rows: ProductRow[];
  warnings: ExtractionWarning[];
}

export interface AggregatedSku {
  sku: string;
  quantity: number;
}

export interface AggregationResult {
  rows: AggregatedSku[];
  uniqueSkus: number;
  totalQuantity: number;
}

export interface ScanResult {
  status: ScanStatus;
  labelsInspected: number;
  rowsDetected: number;
  uniqueSkus: number;
  totalQuantity: number;
  rows: ProductRow[];
  warnings: ExtractionWarning[];
}

export type QuantityParseResult =
  { ok: true; value: number } | { ok: false; code: 'INVALID_QTY' };
