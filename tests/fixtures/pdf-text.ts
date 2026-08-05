import type {
  PdfTextDocument,
  PdfTextPage,
  PositionedTextItem,
} from '../../src/adapters/pdf-text.js';

function text(
  str: string,
  x: number,
  y: number,
  width: number,
  height = 10,
): PositionedTextItem {
  return { str, x, y, width, height };
}

function productHeaders(y: number): PositionedTextItem[] {
  return [
    text('Nama Produk', 40, y, 90),
    text('Variasi', 200, y, 50),
    text('SKU', 300, y, 32),
    text('Qty', 500, y, 28),
  ];
}

function skuBeforeVariationHeaders(y: number): PositionedTextItem[] {
  return [
    text('Nama Produk', 40, y, 90),
    text('SKU', 300, y, 32),
    text('Variasi', 500, y, 50),
    text('Qty', 700, y, 28),
  ];
}

function page(pageNumber: number, items: PositionedTextItem[]): PdfTextPage {
  return { pageNumber, items };
}

export function completePositionedPdfDocument(): PdfTextDocument {
  return {
    pageCount: 2,
    failures: [],
    pages: [
      page(2, [
        text('3', 506, 660, 8),
        text('Standard', 205, 660, 55),
        text('Another Synthetic Product', 40, 660, 145),
        text('000123-AB.C/7', 300, 660, 86),
        ...productHeaders(700),
      ]),
      page(1, [
        text('Second line of wrapped product name', 42, 648, 160),
        text('1', 506, 622, 8),
        text('SKU,WITH.PUNCT/02', 300, 622, 86),
        text('Red / Large', 205, 622, 60),
        text('Wrapped Synthetic Product', 40, 660, 150),
        text('Blue / Small', 205, 660, 60),
        text('2', 506, 660, 8),
        text('123-AB.C/7', 318, 660, 68),
        text('000', 300, 660, 18),
        ...productHeaders(700),
      ]),
    ],
  };
}

export function missingHeaderPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        text('Nama Produk', 40, 700, 90),
        text('Variasi', 200, 700, 50),
        text('Qty', 500, 700, 28),
        text('Synthetic Product', 40, 660, 130),
        text('1', 506, 660, 8),
      ]),
    ],
  };
}

export function duplicateSkuHeaderPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('SKU', 345, 700, 32),
        text('FIRST-SKU', 300, 660, 48),
        text('1', 506, 660, 8),
      ]),
    ],
  };
}

export function malformedRowsPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('VALID-SKU-01', 300, 660, 72),
        text('2', 506, 660, 8),
        text('1', 506, 636, 8),
        text('FIRST-SKU', 300, 612, 20),
        text('SECOND-SKU', 336, 612, 20),
        text('1', 506, 612, 8),
        text('MISSING-QTY-SKU', 300, 588, 88),
        text('ZERO-QTY-SKU', 300, 564, 76),
        text('0', 506, 564, 8),
        text('NEGATIVE-QTY-SKU', 300, 540, 98),
        text('-1', 504, 540, 14),
        text('DECIMAL-QTY-SKU', 300, 516, 92),
        text('1.5', 502, 516, 18),
        text('MALFORMED-QTY-SKU', 300, 492, 106),
        text('x2', 504, 492, 14),
        text('AMBIGUOUS-QTY-SKU', 300, 468, 106),
        text('1', 502, 468, 8),
        text('2', 524, 468, 8),
        text('SPANNING-SKU 2', 300, 444, 240),
      ]),
    ],
  };
}

export function unreadablePageWithReadableRowsPdfDocument(): PdfTextDocument {
  return {
    pageCount: 2,
    failures: [{ pageNumber: 2, code: 'INACCESSIBLE_SOURCE' }],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('VALID-PAGE-SKU', 300, 660, 84),
        text('4', 506, 660, 8),
      ]),
    ],
  };
}

export function onlyUnreadablePagesPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [{ pageNumber: 1, code: 'INACCESSIBLE_SOURCE' }],
    pages: [],
  };
}

export function unmatchedBodyContentPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('VALID-SKU-01', 300, 660, 72),
        text('1', 506, 660, 8),
        text('Body row without isolated identity bands', 40, 610, 190),
      ]),
    ],
  };
}

export function wrappedProductAndFooterPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Synthetic Product With Wrapped Name', 40, 660, 245),
        text('Standard', 205, 660, 55),
        text('WRAPPED-VALID-01', 300, 660, 110),
        text('1', 506, 660, 8),
        text('Synthetic product name continuation one', 42, 650, 290),
        text('Synthetic product name continuation two', 42, 640, 300),
        text('  PeSaN: synthetic-footer  ', 40, 620, 190),
        text('synthetic-footer-sku', 300, 620, 120),
        text('99', 506, 620, 16),
        text('Synthetic footer item', 40, 600, 130),
      ]),
    ],
  };
}

export function wideFooterOriginPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Synthetic Product Before Wide Footer', 40, 660, 190),
        text('Standard', 205, 660, 55),
        text('WIDE-FOOTER-VALID-01', 300, 660, 100),
        text('1', 506, 660, 8),
        text('  PeSaN: synthetic wide footer marker  ', 40, 620, 480),
        text('synthetic-footer-sku', 300, 620, 120),
        text('99', 506, 620, 16),
      ]),
    ],
  };
}

export function adjacentColumnCrossesSkuBandPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Synthetic Product', 40, 660, 130),
        text('Variant cell crosses midpoint', 200, 660, 80),
        text('2', 506, 660, 8),
      ]),
    ],
  };
}

export function closeMalformedBodyRowPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Valid Synthetic Product', 40, 660, 130),
        text('Standard', 205, 660, 55),
        text('VALID-SKU-01', 300, 660, 72),
        text('1', 506, 660, 8),
        text('Separate malformed product', 40, 645, 130),
        text('Separate variation', 205, 645, 65),
      ]),
    ],
  };
}

export function closeProductVariationContinuationPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Close Synthetic Product', 40, 660, 130),
        text('Standard', 205, 660, 55),
        text('CLOSE-CONTINUATION-01', 300, 660, 100),
        text('1', 506, 660, 8),
        text('Close product-only continuation', 40, 652.5, 150),
        text('Standard', 205, 652.5, 55),
        text('Close product wrapped line one', 42, 645, 160),
        text('Close product wrapped line two', 42, 635, 160),
      ]),
    ],
  };
}

export function wideSkuOriginWithIndependentQtyPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Wide Synthetic Product', 40, 660, 130),
        text('Standard', 205, 660, 55),
        text(
          '001-WIDE-SKU/07 Wide Synthetic Product',
          300,
          660,
          240,
        ),
        text('3', 506, 660, 8),
      ]),
    ],
  };
}

export function mergedSkuOriginWithTrailingQtyPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Merged Synthetic Product', 40, 660, 140),
        text('Blue Large', 205, 660, 70),
        text('001-MERGED-SKU/09 Blue Large 2', 300, 660, 260),
      ]),
    ],
  };
}

export function wideSkuOriginIntoVariationPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...skuBeforeVariationHeaders(700),
        text('Wide Synthetic Product', 40, 660, 130),
        text('001-WIDE-VARIATION-SKU/07 Wide Synthetic Product', 300, 660, 150),
        text('Standard', 500, 660, 55),
        text('3', 706, 660, 8),
      ]),
    ],
  };
}

export function ambiguousWideSkuOriginPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...skuBeforeVariationHeaders(700),
        text('Ambiguous Synthetic Product', 40, 660, 130),
        text('001-AMBIGUOUS-SKU/01Standard', 300, 660, 150),
        text('Standard', 500, 660, 55),
        text('1', 706, 660, 8),
      ]),
    ],
  };
}

export function splitSkuContinuationPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Split Synthetic Product', 40, 660, 130),
        text('Standard', 205, 660, 55),
        text('SPLIT-SYNTH-', 300, 660, 72),
        text('1', 506, 660, 8),
        text('42', 300, 650, 12),
      ]),
    ],
  };
}

export function splitSkuContinuationAcrossSkuBandPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...skuBeforeVariationHeaders(700),
        text('Split Synthetic Product', 40, 660, 130),
        text('SPLIT-CROSS- fragment', 300, 660, 125),
        text('Standard', 500, 660, 55),
        text('1', 706, 660, 8),
        text('42', 300, 650, 12),
      ]),
    ],
  };
}

export function skuContinuationWithWrappedProductPdfDocument(): PdfTextDocument {
  return {
    pageCount: 1,
    failures: [],
    pages: [
      page(1, [
        ...productHeaders(700),
        text('Split Wrapped Synthetic Product', 40, 660, 150),
        text('Standard', 205, 660, 55),
        text('SPLIT-WRAPPED-', 300, 660, 84),
        text('1', 506, 660, 8),
        text('42', 300, 650, 12),
        text('Wrapped continuation line one', 42, 650, 150),
        text('Wrapped continuation line two', 42, 640, 150),
        text('Wrapped continuation line three', 42, 630, 150),
      ]),
    ],
  };
}
