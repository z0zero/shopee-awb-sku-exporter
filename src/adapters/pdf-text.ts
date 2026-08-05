import { normalizeSku, parseQuantity } from '../core/normalize.js';
import type {
  AdapterResult,
  ExtractionWarning,
  ProductRow,
  WarningCode,
} from '../core/types.js';

export interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTextPage {
  pageNumber: number;
  items: PositionedTextItem[];
}

export interface PdfPageFailure {
  pageNumber: number;
  code: 'INACCESSIBLE_SOURCE';
}

export interface PdfTextDocument {
  pageCount: number;
  pages: PdfTextPage[];
  failures: PdfPageFailure[];
}

type HeaderName = 'nama produk' | 'variasi' | 'sku' | 'qty';

interface TextGroup {
  y: number;
  maxHeight: number;
  items: PositionedTextItem[];
}

interface HeaderAnchor {
  name: HeaderName;
  centerX: number;
}

interface Band {
  left: number;
  right: number;
}

type ColumnBands = Record<HeaderName, Band>;

interface PageParseResult {
  recognized: boolean;
  rows: ProductRow[];
  warnings: ExtractionWarning[];
}

const HEADER_NAMES: readonly HeaderName[] = [
  'nama produk',
  'variasi',
  'sku',
  'qty',
];
const ZERO_VISUAL_GAP_TOLERANCE = 0.5;
const WRAPPED_TEXT_ROW_TOLERANCE_MULTIPLIER = 2;
const SKU_CONTINUATION_ROW_TOLERANCE_MULTIPLIER = 1.25;
const CLOSE_PRODUCT_VARIATION_ROW_TOLERANCE_MULTIPLIER = 1.25;

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

function unsupportedRowWarning(labelIndex: number): ExtractionWarning {
  return warning(
    'UNSUPPORTED_LAYOUT',
    'A product row layout could not be extracted.',
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

function inaccessibleSourceWarning(labelIndex: number): ExtractionWarning {
  return warning(
    'INACCESSIBLE_SOURCE',
    'A PDF page could not be read.',
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

function normalizeAnchor(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function headerName(raw: string): HeaderName | undefined {
  const normalized = normalizeAnchor(raw);
  return HEADER_NAMES.find((name) => name === normalized);
}

function yTolerance(height: number): number {
  if (!Number.isFinite(height) || height <= 0) {
    return 2;
  }

  return Math.max(2, Math.min(6, height / 2));
}

function sortedItems(
  items: readonly PositionedTextItem[],
): PositionedTextItem[] {
  return [...items]
    .filter((item) => item.str.trim() !== '')
    .sort((left, right) => {
      const yDifference = right.y - left.y;
      return yDifference === 0 ? left.x - right.x : yDifference;
    });
}

function groupItemsByVisualRow(
  items: readonly PositionedTextItem[],
): TextGroup[] {
  const groups: TextGroup[] = [];

  for (const item of sortedItems(items)) {
    const previousGroup = groups.at(-1);
    const tolerance =
      previousGroup === undefined
        ? yTolerance(item.height)
        : Math.max(
            yTolerance(previousGroup.maxHeight),
            yTolerance(item.height),
          );

    if (
      previousGroup !== undefined &&
      Math.abs(previousGroup.y - item.y) <= tolerance
    ) {
      previousGroup.items.push(item);
      previousGroup.items.sort((left, right) => left.x - right.x);
      previousGroup.maxHeight = Math.max(previousGroup.maxHeight, item.height);
      continue;
    }

    groups.push({ y: item.y, maxHeight: item.height, items: [item] });
  }

  return groups;
}

function itemCenterX(item: PositionedTextItem): number {
  return item.x + item.width / 2;
}

function itemRight(item: PositionedTextItem): number {
  return item.x + item.width;
}

function findHeader(
  groups: readonly TextGroup[],
  labelIndex: number,
):
  | { ok: true; groupIndex: number; anchors: HeaderAnchor[] }
  | { ok: false; warning: ExtractionWarning } {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (group === undefined) {
      continue;
    }

    const anchors = group.items.flatMap((item) => {
      const name = headerName(item.str);
      return name === undefined ? [] : [{ name, centerX: itemCenterX(item) }];
    });

    if (anchors.length === 0) {
      continue;
    }

    const skuCount = anchors.filter((anchor) => anchor.name === 'sku').length;
    if (skuCount > 1) {
      return { ok: false, warning: ambiguousSkuWarning(labelIndex) };
    }

    const hasUnambiguousRequiredAnchors = HEADER_NAMES.every(
      (name) => anchors.filter((anchor) => anchor.name === name).length === 1,
    );

    if (!hasUnambiguousRequiredAnchors) {
      return { ok: false, warning: unsupportedLayoutWarning(labelIndex) };
    }

    return { ok: true, groupIndex, anchors };
  }

  return { ok: false, warning: unsupportedLayoutWarning(labelIndex) };
}

function buildColumnBands(anchors: readonly HeaderAnchor[]): ColumnBands {
  const sortedAnchors = [...anchors].sort(
    (left, right) => left.centerX - right.centerX,
  );
  const bands = new Map<HeaderName, Band>();

  sortedAnchors.forEach((anchor, index) => {
    const previous = sortedAnchors[index - 1];
    const next = sortedAnchors[index + 1];
    const left =
      previous === undefined
        ? Number.NEGATIVE_INFINITY
        : (previous.centerX + anchor.centerX) / 2;
    const right =
      next === undefined
        ? Number.POSITIVE_INFINITY
        : (anchor.centerX + next.centerX) / 2;

    bands.set(anchor.name, { left, right });
  });

  const productBand = requiredBand(bands, 'nama produk');
  const skuBand = requiredBand(bands, 'sku');

  return {
    'nama produk': productBand,
    variasi: requiredBand(bands, 'variasi'),
    sku: skuBand,
    qty: requiredBand(bands, 'qty'),
  };
}

function requiredBand(bands: ReadonlyMap<HeaderName, Band>, name: HeaderName) {
  const band = bands.get(name);
  if (band === undefined) {
    throw new Error('missing PDF column band');
  }

  return band;
}

function intersectsBand(item: PositionedTextItem, band: Band): boolean {
  return item.x < band.right && itemRight(item) > band.left;
}

function isWithinBand(item: PositionedTextItem, band: Band): boolean {
  return item.x >= band.left && itemRight(item) <= band.right;
}

function startsWithinBand(item: PositionedTextItem, band: Band): boolean {
  return item.x >= band.left && item.x < band.right;
}

function columnOrigins(group: TextGroup, bands: ColumnBands): Set<HeaderName> {
  const origins = new Set<HeaderName>();

  for (const item of group.items) {
    if (startsWithinBand(item, bands['nama produk'])) {
      origins.add('nama produk');
    }
    if (startsWithinBand(item, bands.variasi)) {
      origins.add('variasi');
    }
    if (startsWithinBand(item, bands.sku)) {
      origins.add('sku');
    }
    if (isWithinBand(item, bands.qty)) {
      origins.add('qty');
    }
  }

  return origins;
}

function isRowLike(group: TextGroup, bands: ColumnBands): boolean {
  const origins = columnOrigins(group, bands);
  return origins.has('sku') || origins.has('qty') || origins.size >= 2;
}

function isWrappedContinuation(
  group: TextGroup,
  previousAcceptedGroup: TextGroup | undefined,
  bands: ColumnBands,
): boolean {
  const origins = columnOrigins(group, bands);
  if (
    previousAcceptedGroup === undefined ||
    group.items.length !== 1 ||
    !origins.has('nama produk') ||
    origins.size !== 1
  ) {
    return false;
  }

  const tolerance =
    Math.max(group.maxHeight, previousAcceptedGroup.maxHeight) *
    WRAPPED_TEXT_ROW_TOLERANCE_MULTIPLIER;
  return (
    group.y < previousAcceptedGroup.y &&
    previousAcceptedGroup.y - group.y <= tolerance
  );
}

function isCloseProductVariationContinuation(
  group: TextGroup,
  previousAcceptedGroup: TextGroup | undefined,
  bands: ColumnBands,
): boolean {
  const productItems = group.items.filter((item) =>
    startsWithinBand(item, bands['nama produk']),
  );
  const variationItems = group.items.filter((item) =>
    startsWithinBand(item, bands.variasi),
  );
  const origins = columnOrigins(group, bands);
  const [productItem] = productItems;
  const [variationItem] = variationItems;

  if (
    previousAcceptedGroup === undefined ||
    group.items.length !== 2 ||
    productItems.length !== 1 ||
    variationItems.length !== 1 ||
    productItem === undefined ||
    variationItem === undefined ||
    productItem === variationItem ||
    origins.size !== 2 ||
    !origins.has('nama produk') ||
    !origins.has('variasi')
  ) {
    return false;
  }

  const tolerance =
    Math.max(group.maxHeight, previousAcceptedGroup.maxHeight) *
    CLOSE_PRODUCT_VARIATION_ROW_TOLERANCE_MULTIPLIER;
  return (
    group.y < previousAcceptedGroup.y &&
    previousAcceptedGroup.y - group.y <= tolerance
  );
}

function isFooterGroup(group: TextGroup, bands: ColumnBands): boolean {
  return group.items.some(
    (item) =>
      startsWithinBand(item, bands['nama produk']) &&
      normalizeAnchor(item.str).startsWith('pesan:'),
  );
}

function belongsToTableColumn(group: TextGroup, bands: ColumnBands): boolean {
  return columnOrigins(group, bands).size > 0;
}

function appendUnmatchedBodyWarning(
  warnings: ExtractionWarning[],
  group: TextGroup,
  bands: ColumnBands,
  labelIndex: number,
): void {
  if (belongsToTableColumn(group, bands)) {
    warnings.push(unsupportedRowWarning(labelIndex));
  }
}

function sortedCellItems(
  items: readonly PositionedTextItem[],
): PositionedTextItem[] {
  return [...items].sort((left, right) => left.x - right.x);
}

function canJoinZeroGap(items: readonly PositionedTextItem[]): boolean {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];

    if (previous === undefined || current === undefined) {
      continue;
    }

    const visualGap = current.x - (previous.x + previous.width);
    if (Math.abs(visualGap) > ZERO_VISUAL_GAP_TOLERANCE) {
      return false;
    }
  }

  return true;
}

function parseSku(
  items: readonly PositionedTextItem[],
  labelIndex: number,
): { ok: true; value: string } | { ok: false; warning: ExtractionWarning } {
  if (items.length === 0) {
    return { ok: false, warning: missingSkuWarning(labelIndex) };
  }

  const sorted = sortedCellItems(items);

  if (!canJoinZeroGap(sorted)) {
    return { ok: false, warning: ambiguousSkuWarning(labelIndex) };
  }

  const sku = normalizeSku(sorted.map((item) => item.str).join(''));
  if (sku === '') {
    return { ok: false, warning: missingSkuWarning(labelIndex) };
  }

  return { ok: true, value: sku };
}

function leadingSkuToken(raw: string): string | undefined {
  const trimmed = raw.trim();
  const boundary = trimmed.search(/\s/u);

  // PDF.js can merge a SKU-origin item with adjacent product text; only the
  // first whitespace-delimited token is attributable to the SKU column.
  if (boundary <= 0) {
    return undefined;
  }

  return normalizeSku(trimmed.slice(0, boundary));
}

function hasAdjacentVariationSuffix(
  skuItem: PositionedTextItem,
  group: TextGroup,
  bands: ColumnBands,
): boolean {
  const skuText = skuItem.str.trim();
  if (skuText === '') {
    return false;
  }

  return group.items.some((item) => {
    if (item === skuItem || !startsWithinBand(item, bands.variasi)) {
      return false;
    }

    const variationText = item.str.trim();
    return variationText !== '' && skuText.endsWith(variationText);
  });
}

function parseMergedSkuOriginItem(
  item: PositionedTextItem,
): { sku: string; quantity: number } | undefined {
  const tokens = item.str.trim().split(/\s+/u);
  const leadingSku = tokens[0];
  const trailingQty = tokens.at(-1);

  // PDF.js can retain the SKU-cell origin while merging title text and Qty
  // across the SKU/Qty band boundary.
  if (
    tokens.length < 3 ||
    leadingSku === undefined ||
    trailingQty === undefined
  ) {
    return undefined;
  }

  const quantity = parseQuantity(trailingQty);
  const sku = normalizeSku(leadingSku);
  if (sku === '' || !quantity.ok) {
    return undefined;
  }

  return { sku, quantity: quantity.value };
}

function parseQty(
  items: readonly PositionedTextItem[],
  labelIndex: number,
): { ok: true; value: number } | { ok: false; warning: ExtractionWarning } {
  if (items.length !== 1) {
    return { ok: false, warning: invalidQtyWarning(labelIndex) };
  }

  const [item] = items;
  if (item === undefined) {
    return { ok: false, warning: invalidQtyWarning(labelIndex) };
  }

  const quantity = parseQuantity(item.str);
  if (!quantity.ok) {
    return { ok: false, warning: invalidQtyWarning(labelIndex) };
  }

  return { ok: true, value: quantity.value };
}

function parseIdentityGroup(
  group: TextGroup,
  bands: ColumnBands,
  labelIndex: number,
): { row?: ProductRow; warnings: ExtractionWarning[] } {
  const skuItems = group.items.filter((item) =>
    startsWithinBand(item, bands.sku),
  );
  const qtyItems = group.items.filter((item) => isWithinBand(item, bands.qty));
  const spanningSkuItems = skuItems.filter((item) =>
    intersectsBand(item, bands.qty),
  );
  const spanningIdentityItem = group.items.some(
    (item) =>
      intersectsBand(item, bands.sku) && intersectsBand(item, bands.qty),
  );

  if (
    skuItems.length === 1 &&
    spanningSkuItems.length === 1 &&
    qtyItems.length === 0 &&
    spanningSkuItems[0] !== undefined
  ) {
    const merged = parseMergedSkuOriginItem(spanningSkuItems[0]);
    if (merged !== undefined) {
      return {
        row: {
          sku: merged.sku,
          quantity: merged.quantity,
          labelIndex,
          source: 'pdf',
        },
        warnings: [],
      };
    }
  }

  if (spanningIdentityItem) {
    const quantity = parseQty(qtyItems, labelIndex);
    const [skuItem] = skuItems;
    const sku =
      skuItems.length === 1 && skuItem !== undefined
        ? leadingSkuToken(skuItem.str)
        : undefined;

    if (!quantity.ok || sku === undefined || sku === '') {
      return { warnings: [unsupportedRowWarning(labelIndex)] };
    }

    return {
      row: {
        sku,
        quantity: quantity.value,
        labelIndex,
        source: 'pdf',
      },
      warnings: [],
    };
  }

  const [skuItem] = skuItems;
  if (
    skuItems.length === 1 &&
    skuItem !== undefined &&
    itemRight(skuItem) > bands.sku.right
  ) {
    const sku = leadingSkuToken(skuItem.str);
    const quantity = parseQty(qtyItems, labelIndex);

    if (sku === undefined || sku === '') {
      if (hasAdjacentVariationSuffix(skuItem, group, bands)) {
        return {
          warnings: [
            ambiguousSkuWarning(labelIndex),
            ...(quantity.ok ? [] : [quantity.warning]),
          ],
        };
      }
    } else {
      if (!quantity.ok) {
        return { warnings: [quantity.warning] };
      }

      return {
        row: {
          sku,
          quantity: quantity.value,
          labelIndex,
          source: 'pdf',
        },
        warnings: [],
      };
    }
  }

  const sku = parseSku(skuItems, labelIndex);
  const quantity = parseQty(qtyItems, labelIndex);
  const warnings = [
    ...(sku.ok ? [] : [sku.warning]),
    ...(quantity.ok ? [] : [quantity.warning]),
  ];

  if (!sku.ok || !quantity.ok) {
    return { warnings };
  }

  return {
    row: {
      sku: sku.value,
      quantity: quantity.value,
      labelIndex,
      source: 'pdf',
    },
    warnings: [],
  };
}

function isSkuContinuation(
  group: TextGroup,
  previousAcceptedGroup: TextGroup | undefined,
  bands: ColumnBands,
): boolean {
  const skuItems = group.items.filter((candidate) =>
    startsWithinBand(candidate, bands.sku),
  );
  const productItems = group.items.filter((candidate) =>
    startsWithinBand(candidate, bands['nama produk']),
  );
  const origins = columnOrigins(group, bands);
  const [item] = skuItems;
  const previousSkuItems =
    previousAcceptedGroup?.items.filter((candidate) =>
      startsWithinBand(candidate, bands.sku),
    ) ?? [];
  const [previousSkuItem] = previousSkuItems;

  if (
    item === undefined ||
    previousSkuItem === undefined ||
    previousSkuItems.length !== 1 ||
    !(
      (group.items.length === 1 &&
        skuItems.length === 1 &&
        productItems.length === 0 &&
        origins.size === 1) ||
      (group.items.length === 2 &&
        skuItems.length === 1 &&
        productItems.length === 1 &&
        origins.size === 2 &&
        origins.has('nama produk') &&
        origins.has('sku'))
    ) ||
    !isWithinBand(item, bands.sku) ||
    !startsWithinBand(previousSkuItem, bands.sku) ||
    item.str.trim() === '' ||
    /\s/u.test(item.str.trim())
  ) {
    return false;
  }

  const tolerance =
    Math.max(group.maxHeight, previousAcceptedGroup?.maxHeight ?? 0) *
    SKU_CONTINUATION_ROW_TOLERANCE_MULTIPLIER;

  return (
    previousAcceptedGroup !== undefined &&
    group.y < previousAcceptedGroup.y &&
    previousAcceptedGroup.y - group.y <= tolerance &&
    Math.abs(item.x - previousSkuItem.x) <= ZERO_VISUAL_GAP_TOLERANCE
  );
}

function parsePage(page: PdfTextPage): PageParseResult {
  const labelIndex = page.pageNumber;
  const groups = groupItemsByVisualRow(page.items);

  if (groups.length === 0) {
    return { recognized: false, rows: [], warnings: [] };
  }

  const header = findHeader(groups, labelIndex);
  if (!header.ok) {
    return {
      recognized: false,
      rows: [],
      warnings: [header.warning],
    };
  }

  const bands = buildColumnBands(header.anchors);
  const bodyGroups = groups.slice(header.groupIndex + 1);
  const rows: ProductRow[] = [];
  const warnings: ExtractionWarning[] = [];
  let hasSeenRowLikeGroup = false;
  let previousAcceptedGroup: TextGroup | undefined;

  for (const group of bodyGroups) {
    if (isFooterGroup(group, bands) && hasSeenRowLikeGroup) {
      break;
    }

    if (isSkuContinuation(group, previousAcceptedGroup, bands)) {
      const previousRow = rows.at(-1);
      const continuationItem = group.items.find((item) =>
        startsWithinBand(item, bands.sku),
      );
      if (continuationItem !== undefined && previousRow !== undefined) {
        previousRow.sku = normalizeSku(
          `${previousRow.sku}${continuationItem.str.trim()}`,
        );
        previousAcceptedGroup = group;
        continue;
      }
    }

    if (
      isCloseProductVariationContinuation(group, previousAcceptedGroup, bands)
    ) {
      previousAcceptedGroup = group;
      continue;
    }

    if (isRowLike(group, bands)) {
      hasSeenRowLikeGroup = true;
      const parsed = parseIdentityGroup(group, bands, labelIndex);
      if (parsed.row !== undefined) {
        rows.push(parsed.row);
        previousAcceptedGroup = group;
      } else {
        previousAcceptedGroup = undefined;
      }
      warnings.push(...parsed.warnings);
      continue;
    }

    if (isWrappedContinuation(group, previousAcceptedGroup, bands)) {
      previousAcceptedGroup = group;
      continue;
    }

    appendUnmatchedBodyWarning(warnings, group, bands, labelIndex);
    previousAcceptedGroup = undefined;
  }

  return { recognized: true, rows, warnings };
}

function pageFailureWarnings(
  failures: readonly PdfPageFailure[],
): ExtractionWarning[] {
  return [...failures]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((failure) => inaccessibleSourceWarning(failure.pageNumber));
}

function withPartialWarning(warnings: readonly ExtractionWarning[]) {
  const firstWarningLabelIndex = warnings[0]?.labelIndex;
  return [...warnings, partialExtractionWarning(firstWarningLabelIndex)];
}

export function extractPdfTextRows(document: PdfTextDocument): AdapterResult {
  const rows: ProductRow[] = [];
  const warnings = pageFailureWarnings(document.failures);
  let recognizedPageCount = 0;

  for (const page of [...document.pages].sort(
    (left, right) => left.pageNumber - right.pageNumber,
  )) {
    const parsed = parsePage(page);
    if (parsed.recognized) {
      recognizedPageCount += 1;
    }
    rows.push(...parsed.rows);
    warnings.push(...parsed.warnings);
  }

  if (rows.length > 0 && warnings.length === 0) {
    return {
      status: 'complete',
      labelsInspected: document.pageCount,
      rows,
      warnings: [],
    };
  }

  if (rows.length > 0) {
    return {
      status: 'partial',
      labelsInspected: document.pageCount,
      rows,
      warnings: withPartialWarning(warnings),
    };
  }

  const inaccessibleOnly =
    warnings.length > 0 &&
    warnings.every((item) => item.code === 'INACCESSIBLE_SOURCE');

  if (inaccessibleOnly) {
    return {
      status: 'inaccessible',
      labelsInspected: document.pageCount,
      rows: [],
      warnings,
    };
  }

  if (recognizedPageCount > 0 && warnings.length === 0) {
    return {
      status: 'empty',
      labelsInspected: document.pageCount,
      rows: [],
      warnings: [],
    };
  }

  return {
    status: 'unsupported',
    labelsInspected: document.pageCount,
    rows: [],
    warnings:
      warnings.length > 0
        ? warnings
        : [warning('UNSUPPORTED_LAYOUT', 'No product table was recognized.')],
  };
}
