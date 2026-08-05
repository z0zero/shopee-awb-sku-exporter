import { normalizeSku, parseQuantity } from '../core/normalize.js';
import type {
  AdapterResult,
  ExtractionWarning,
  ProductRow,
  WarningCode,
} from '../core/types.js';

interface HeaderMap {
  sku: number;
  qty: number;
}

interface RowCells {
  cells: string[];
}

interface ParsedCandidate {
  candidateRows: RowCells[];
  rows: ProductRow[];
  warnings: ExtractionWarning[];
}

const ANCHOR_LABELS = new Set(['sku', 'qty', 'nama produk', 'variasi']);

function normalizeAnchor(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function cellText(element: Element): string {
  return element.textContent ?? '';
}

function warning(
  code: WarningCode,
  message: string,
  labelIndex?: number,
): ExtractionWarning {
  return labelIndex === undefined
    ? { code, message }
    : { code, message, labelIndex };
}

function unsupportedLayoutWarning(labelIndex: number): ExtractionWarning {
  return warning(
    'UNSUPPORTED_LAYOUT',
    'Required product table anchors are missing.',
    labelIndex,
  );
}

function ambiguousSkuWarning(labelIndex: number): ExtractionWarning {
  return warning('AMBIGUOUS_SKU', 'SKU anchor is ambiguous.', labelIndex);
}

function missingSkuWarning(labelIndex: number): ExtractionWarning {
  return warning('MISSING_SKU', 'A product row is missing a SKU.', labelIndex);
}

function invalidQtyWarning(labelIndex: number): ExtractionWarning {
  return warning(
    'INVALID_QTY',
    'A product row has an invalid quantity.',
    labelIndex,
  );
}

function partialExtractionWarning(labelIndex?: number): ExtractionWarning {
  return warning(
    'PARTIAL_EXTRACTION',
    'Some product rows could not be extracted.',
    labelIndex,
  );
}

function directRole(element: Element): string {
  return element.getAttribute('role')?.trim().toLowerCase() ?? '';
}

function isTableElement(element: Element): element is HTMLTableElement {
  return element.tagName.toLowerCase() === 'table';
}

function candidateElements(root: ParentNode): Element[] {
  return Array.from(
    root.querySelectorAll('table, [role="table"], [role="grid"]'),
  );
}

function tableRowCells(table: HTMLTableElement): RowCells[] {
  return Array.from(table.rows, (row) => ({
    cells: Array.from(row.cells, cellText),
  }));
}

function roleRowCells(container: Element): RowCells[] {
  const rows = Array.from(container.querySelectorAll('[role="row"]'));

  return rows.map((row) => ({
    cells: Array.from(
      row.querySelectorAll(
        '[role="columnheader"], [role="rowheader"], [role="cell"], [role="gridcell"]',
      ),
      cellText,
    ),
  }));
}

function findHeaderMap(rows: readonly RowCells[]): {
  map?: HeaderMap;
  headerRowIndex?: number;
  warnings: ExtractionWarning[];
} {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row === undefined) {
      continue;
    }

    const normalizedCells = row.cells.map(normalizeAnchor);
    const skuIndexes = indexesOf(normalizedCells, 'sku');
    const qtyIndexes = indexesOf(normalizedCells, 'qty');

    if (skuIndexes.length === 0 && qtyIndexes.length === 0) {
      continue;
    }

    if (skuIndexes.length > 1) {
      return { warnings: [ambiguousSkuWarning(0)] };
    }

    const requiredAnchorsPresent =
      skuIndexes.length === 1 &&
      qtyIndexes.length === 1 &&
      normalizedCells.includes('nama produk') &&
      normalizedCells.includes('variasi');

    if (!requiredAnchorsPresent) {
      return { warnings: [unsupportedLayoutWarning(0)] };
    }

    const sku = skuIndexes[0];
    const qty = qtyIndexes[0];
    if (sku === undefined || qty === undefined) {
      return { warnings: [unsupportedLayoutWarning(0)] };
    }

    return {
      map: { sku, qty },
      headerRowIndex: rowIndex,
      warnings: [],
    };
  }

  return { warnings: [unsupportedLayoutWarning(0)] };
}

function indexesOf(values: readonly string[], expected: string): number[] {
  return values.flatMap((value, index) => (value === expected ? [index] : []));
}

function hasContent(cells: readonly string[]): boolean {
  return cells.some((cell) => cell.trim() !== '');
}

function parseColumnRows(
  rows: readonly RowCells[],
  headerRowIndex: number,
  headerMap: HeaderMap,
  labelIndex: number,
): ParsedCandidate {
  const candidateRows = rows
    .slice(headerRowIndex + 1)
    .filter((row) => hasContent(row.cells));
  const parsedRows: ProductRow[] = [];
  const warnings: ExtractionWarning[] = [];

  for (const row of candidateRows) {
    const skuCell = row.cells[headerMap.sku] ?? '';
    const qtyCell = row.cells[headerMap.qty] ?? '';
    const sku = normalizeSku(skuCell);
    const quantity = parseQuantity(qtyCell);

    if (sku === '') {
      warnings.push(missingSkuWarning(labelIndex));
    }

    if (!quantity.ok) {
      warnings.push(invalidQtyWarning(labelIndex));
    }

    if (sku !== '' && quantity.ok) {
      parsedRows.push({
        sku,
        quantity: quantity.value,
        labelIndex,
        source: 'dom',
      });
    }
  }

  return { candidateRows, rows: parsedRows, warnings };
}

function parseFallbackRows(
  rows: readonly RowCells[],
  labelIndex: number,
): ParsedCandidate {
  const parsedRows: ProductRow[] = [];
  const warnings: ExtractionWarning[] = [];
  const candidateRows: RowCells[] = [];

  for (const row of rows) {
    const normalizedCells = row.cells.map(normalizeAnchor);
    const skuLabelIndexes = indexesOf(normalizedCells, 'sku');
    const qtyLabelIndexes = indexesOf(normalizedCells, 'qty');

    if (skuLabelIndexes.length === 0 && qtyLabelIndexes.length === 0) {
      continue;
    }

    candidateRows.push(row);

    if (skuLabelIndexes.length > 1) {
      warnings.push(ambiguousSkuWarning(labelIndex));
      continue;
    }

    if (skuLabelIndexes.length !== 1 || qtyLabelIndexes.length !== 1) {
      warnings.push(unsupportedLayoutWarning(labelIndex));
      continue;
    }

    const skuLabelIndex = skuLabelIndexes[0];
    const qtyLabelIndex = qtyLabelIndexes[0];

    if (skuLabelIndex === undefined || qtyLabelIndex === undefined) {
      warnings.push(unsupportedLayoutWarning(labelIndex));
      continue;
    }

    const skuCell = nextValueCell(row.cells, skuLabelIndex);
    const qtyCell = nextValueCell(row.cells, qtyLabelIndex);
    const sku = normalizeSku(skuCell ?? '');
    const quantity = parseQuantity(qtyCell ?? '');

    if (sku === '') {
      warnings.push(missingSkuWarning(labelIndex));
    }

    if (!quantity.ok) {
      warnings.push(invalidQtyWarning(labelIndex));
    }

    if (sku !== '' && quantity.ok) {
      parsedRows.push({
        sku,
        quantity: quantity.value,
        labelIndex,
        source: 'dom',
      });
    }
  }

  return { candidateRows, rows: parsedRows, warnings };
}

function nextValueCell(
  cells: readonly string[],
  labelIndex: number,
): string | undefined {
  const nextCell = cells[labelIndex + 1];

  if (nextCell === undefined || ANCHOR_LABELS.has(normalizeAnchor(nextCell))) {
    return undefined;
  }

  return nextCell;
}

function parseCandidate(element: Element, labelIndex: number): ParsedCandidate {
  const rows = isTableElement(element)
    ? tableRowCells(element)
    : roleRowCells(element);
  const header = findHeaderMap(rows);

  if (
    header.map !== undefined &&
    header.headerRowIndex !== undefined &&
    header.warnings.length === 0
  ) {
    return parseColumnRows(rows, header.headerRowIndex, header.map, labelIndex);
  }

  if (directRole(element) === 'table' || directRole(element) === 'grid') {
    const fallback = parseFallbackRows(rows, labelIndex);
    if (fallback.candidateRows.length > 0) {
      return fallback;
    }
  }

  return {
    candidateRows: [],
    rows: [],
    warnings: header.warnings.map((headerWarning) => ({
      ...headerWarning,
      labelIndex,
    })),
  };
}

export function extractDomRows(
  root: ParentNode,
  options: { labelIndexOffset?: number } = {},
): AdapterResult {
  const candidates = candidateElements(root);
  const rows: ProductRow[] = [];
  const warnings: ExtractionWarning[] = [];
  let candidateRowCount = 0;
  let emptyCandidateCount = 0;
  const labelIndexOffset = options.labelIndexOffset ?? 0;

  candidates.forEach((candidate, candidateIndex) => {
    const labelIndex = labelIndexOffset + candidateIndex + 1;
    const parsed = parseCandidate(candidate, labelIndex);

    candidateRowCount += parsed.candidateRows.length;
    if (parsed.candidateRows.length === 0 && parsed.warnings.length === 0) {
      emptyCandidateCount += 1;
    }

    rows.push(...parsed.rows);
    warnings.push(...parsed.warnings);
  });

  if (rows.length > 0 && warnings.length === 0) {
    return {
      status: 'complete',
      labelsInspected: candidates.length,
      rows,
      warnings,
    };
  }

  if (rows.length > 0) {
    const firstWarningLabelIndex =
      warnings[0]?.labelIndex ?? rows[0]?.labelIndex;
    return {
      status: 'partial',
      labelsInspected: candidates.length,
      rows,
      warnings: [...warnings, partialExtractionWarning(firstWarningLabelIndex)],
    };
  }

  if (
    candidates.length > 0 &&
    warnings.length === 0 &&
    candidateRowCount === 0 &&
    emptyCandidateCount === candidates.length
  ) {
    return {
      status: 'empty',
      labelsInspected: candidates.length,
      rows: [],
      warnings: [],
    };
  }

  return {
    status: 'unsupported',
    labelsInspected: candidates.length,
    rows: [],
    warnings:
      warnings.length > 0
        ? warnings
        : [warning('UNSUPPORTED_LAYOUT', 'No product table was recognized.')],
  };
}
