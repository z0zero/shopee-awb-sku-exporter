# Shopee AWB SKU Exporter Design

**Date:** 2026-08-03
**Status:** Approved architecture; implementation plan intentionally pending explicit approval
**Scope:** Chromium-based Chrome and Microsoft Edge, Shopee Seller Center AWB print pages only

## Goal and constraints

The extension reads every product row available in the active Shopee AWB print document, preserves SKU text, parses positive integer quantities, aggregates duplicate SKUs in first-seen order, and offers a UTF-8 CSV download with the exact header `SKU,Jumlah`.

All processing stays on the device. Label contents, customer data, and extracted results are never sent to an external service, persisted to extension storage, logged, or included in diagnostics. The real `RESI.pdf` is a local integration fixture only and remains ignored. Automated fixtures are synthetic and redacted.

The supplied fixture has a usable PDF text layer rather than image-only pages. It contains multiple labels and multiple product rows, including wrapped product names. That evidence rules out OCR for v1 and supports deterministic text-layer parsing. The unauthenticated public AWB route did not expose the authenticated rendered document structure, so the implementation must report an inaccessible or changed source clearly rather than assume a particular Shopee markup contract.

## Alternatives considered

### DOM-only adapter

A content script would read semantic HTML or accessible text from the AWB page and parse product-table rows. This is the smallest package and avoids PDF.js, but it cannot reliably process a printable document exposed only as a PDF, canvas, or inaccessible viewer frame.

### PDF-only adapter

The extension would acquire the active PDF and parse every page with PDF.js. This matches the supplied fixture well, but it fails when Shopee renders the labels as normal HTML and may not be able to access the browser's internal PDF viewer context.

### Hybrid adapter pipeline — recommended

The content script tries structured DOM/accessibility extraction first, then a narrowly scoped local PDF adapter when a reachable PDF or blob source exists and no complete DOM result is available. Both adapters return the same normalized row contract. This preserves the smallest reliable path for normal pages while covering the observed text-layer PDF representation. PDF.js is bundled locally only for this fallback; no remote script or remote parsing service is used.

## Architecture

The project uses TypeScript, a small custom build script, esbuild, Vitest, and a minimal HTML/CSS popup. React and a large extension framework are unnecessary.

The source layout will keep browser wiring separate from pure logic:

- `src/core/types.ts` — normalized rows, scan statuses, warning codes, and result contracts.
- `src/core/normalize.ts` — SKU text normalization and positive Qty validation.
- `src/core/aggregate.ts` — first-seen `Map` aggregation and summary metrics.
- `src/core/csv.ts` — RFC-compatible cell escaping, BOM, CRLF output, and deterministic filename generation.
- `src/adapters/dom.ts` — DOM/table and accessible-text extraction, including layout whitespace and wrapping tolerance.
- `src/adapters/pdf.ts` — local PDF.js text-content extraction using page coordinates and stable field anchors.
- `src/content/index.ts` — page/frame discovery and runtime message handling; no aggregation or CSV policy.
- `src/popup/index.ts` and `src/popup/*` — user action, summary, warnings, confirmation, and download.
- `src/manifest.json` and `scripts/build.ts` — Manifest V3 metadata and reproducible packaging.

The extension will statically match `https://seller.shopee.co.id/awbprint*` at `document_idle`. The host permission will be limited to the Shopee Seller origin required to inspect the page and retrieve a same-origin printable source. The manifest will request only the download capability needed for the explicit CSV action; it will not request `<all_urls>`, unrelated hosts, storage, telemetry, or authentication permissions.

## Contracts and data flow

The adapter boundary is explicit:

```text
active AWB page
  -> DOM adapter or reachable PDF adapter
  -> ExtractionResult
  -> normalized ProductRow[]
  -> validation warnings
  -> first-seen SKU aggregation
  -> CSV serialization
  -> explicit browser download
```

The core contracts are:

```ts
interface ProductRow {
  sku: string;
  quantity: number;
  labelIndex: number;
  source: 'dom' | 'pdf';
}

interface ExtractionWarning {
  code:
    | 'MISSING_SKU'
    | 'AMBIGUOUS_SKU'
    | 'INVALID_QTY'
    | 'INACCESSIBLE_SOURCE'
    | 'UNSUPPORTED_LAYOUT'
    | 'PARTIAL_EXTRACTION';
  message: string;
  labelIndex?: number;
}

interface ScanResult {
  status: 'complete' | 'partial' | 'empty' | 'inaccessible' | 'unsupported';
  labelsInspected: number;
  rowsDetected: number;
  uniqueSkus: number;
  totalQuantity: number;
  rows: ProductRow[];
  warnings: ExtractionWarning[];
}
```

The popup first checks the active tab URL and returns an actionable unsupported-page message when it is not the AWB route. On a supported page, it sends a scan message to the content script. The content script recursively inspects accessible same-origin frames, catches inaccessible-frame errors, and selects the DOM result before attempting the PDF fallback. It never combines both representations, preventing double counting. The result exists in memory only.

## Parsing rules

The DOM adapter searches for stable field labels such as `SKU`, `Qty`, `Nama Produk`, and `Variasi`, then groups table cells or accessible text by row. It tolerates repeated whitespace, line wrapping, and product names spanning multiple visual lines. It rejects a row when the SKU is absent, ambiguous, or not a non-empty text value. SKU normalization trims layout whitespace but never converts text to a number or removes meaningful punctuation and leading zeroes.

The PDF adapter loads PDF bytes with the bundled PDF.js display API and requests text content page by page. It identifies the product table from field-anchor positions, uses the Qty column as a row anchor, and reads the SKU column from the same row band. This is coordinate-aware because the fixture's text extraction can merge adjacent columns when a row has no whitespace gap. It supports every page, multiple rows per page, wrapped product names, and layout whitespace. It does not render pages or perform OCR.

Qty accepts only a positive base-10 integer after whitespace normalization. Zero, negative, decimal, malformed, missing, or ambiguous values produce warnings and are not invented. A source with any skipped or uncertain row is `partial`, even when other rows are valid.

## Popup and CSV behavior

The popup has one primary `Scan & Export CSV` flow but separates scanning from downloading. After scanning it displays labels/pages inspected, product rows, unique SKUs, total quantity, and every warning. A complete result exposes `Download CSV`. A partial result exposes a clearly labeled confirmation control such as `Download partial result`; the control remains unavailable until the user explicitly acknowledges the warnings. Empty, inaccessible, and unsupported results do not offer a download.

CSV serialization uses first-seen SKU order, the exact `SKU,Jumlah` header, CRLF row endings, and standard escaping: cells containing commas, quotes, or line breaks are double-quoted and internal quotes are doubled. The byte sequence begins with UTF-8 BOM `EF BB BF`. Filenames use `shopee-awb-sku-YYYYMMDD-HHmmss.csv`. The popup passes the generated Blob URL to the browser downloads API, then revokes it after the download request; no file is uploaded or stored by the extension.

## Privacy and security boundaries

The only external document access is a validated HTTPS, same-origin source belonging to the active Shopee Seller page. Arbitrary URLs, redirects, cross-origin frames, and external services are rejected or reported as inaccessible. PDF byte and page-count limits will bound resource use without changing normal label processing. Text is handled as data; popup rendering uses text-safe DOM APIs, not `innerHTML`, `eval`, or string-executed code. Warnings contain generic codes and counts rather than raw label text. PDF.js and its worker are packaged locally to comply with Manifest V3's no-remote-code model.

## Error behavior

The user receives one of these actionable outcomes:

- **Unsupported page:** open `https://seller.shopee.co.id/awbprint?...` in the active tab.
- **Inaccessible source:** the page or frame exists but the extension cannot read its rendered labels or PDF bytes.
- **No rows:** the source was readable but no product table was recognized.
- **Changed layout:** expected anchors are missing or conflicting; the scan is not treated as complete.
- **Partial:** some rows were valid while others had missing/ambiguous SKU, malformed Qty, or an unreadable page.
- **Complete:** all inspected labels/pages yielded valid rows and no warnings remain.

No status silently converts uncertainty into a valid row or automatically downloads a misleading CSV.

## Testing and verification

Pure-core tests cover SKU normalization with leading zeroes and punctuation, positive Qty parsing, duplicate aggregation, first-seen ordering, CSV escaping, BOM bytes, filename shape, and all scan statuses. Synthetic DOM fixtures cover multiple labels, multiple rows, wrapped product names, layout whitespace, missing fields, malformed fields, and partial warnings. Synthetic PDF text-content fixtures cover coordinate grouping without copying text from the real PDF.

The local integration harness may open `D:\Downloads\RESI.pdf` and assert structural counts and valid output shape only. It must never print extracted label text, write a committed snapshot, or save customer/shipment identifiers. Manual verification will load the unpacked build in Chrome and Edge, test the supported URL gate, scan the supplied fixture through the chosen local path, inspect the CSV manually for duplicate summation, and test an authenticated or safely captured AWB representation when available. Final verification will include formatting, type checking, linting, unit/integration tests, production build, manifest permission review, and `git diff --check`.

## Sources

- Chrome Manifest V3 manifest reference: https://developer.chrome.com/docs/extensions/reference/manifest
- Chrome content scripts, frames, messaging, and isolated-world guidance: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome match patterns: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- Chrome downloads API: https://developer.chrome.com/docs/extensions/reference/api/downloads
- Chrome Manifest V3 overview and remote-code restriction: https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- Microsoft Edge Chromium extension compatibility and porting: https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension
- PDF.js browser examples and `getDocument`: https://mozilla.github.io/pdf.js/examples/index.html
- PDF.js API reference: https://mozilla.github.io/pdf.js/api/
