# Shopee AWB Local PDF and Warning Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove false PDF row warnings and add a permission-minimal, user-selected local PDF scan flow that produces the same validated SKU summary and CSV as the existing Shopee AWB page scan.

**Architecture:** The PDF text adapter will classify rows by table-cell origins inside a footer-bounded region and support chained wrapped product-name lines. A source-independent result builder, PDF policy module, result UI, and CSV download boundary will be shared by the existing content pipeline and a persistent extension-owned local-PDF page opened from the popup.

**Tech Stack:** TypeScript 6.0.2, npm 11.4.1, esbuild 0.28.1, Vitest 4.1.10, jsdom 29.1.1, PDF.js `pdfjs-dist` 6.2.108, Chrome/Edge Manifest V3 APIs, and minimal HTML/CSS.

**Approval gate:** Approved by the user 2026-08-05. Implementation proceeds in the existing worktree; do not integrate into `main` without an explicit branch-completion choice.

## Global Constraints

- Execute approved tasks in the existing `D:\extensions\shopee-awb-sku-exporter\.worktrees\implementation` worktree on `feature/shopee-awb-sku-exporter-v1`; do not create a second implementation worktree.
- Use `superpowers:test-driven-development` for every behavior change: write one focused failing test, observe the intended failure, implement the minimum passing behavior, and rerun focused plus relevant broader checks.
- Use `superpowers:requesting-code-review` after each independently reviewable task and `agent-skills:source-driven-development` to verify every reviewer claim that depends on browser, Manifest V3, File API, or PDF.js behavior.
- GPG-sign every new root and implementation-worktree commit with `git commit -S`, then run `git verify-commit HEAD` before treating the commit as complete. The earlier unsigned worktree-only exception is revoked; no unsigned intermediate commit may enter `main`.
- Keep `D:\Downloads\RESI.pdf` and every downloaded AWB outside Git. Never print, log, snapshot, document, stage, or commit PDF text, SKU values, filenames, paths, customer data, addresses, order identifiers, tracking identifiers, or other shipment data. The private harness may output only aggregate integer counts, status, and warning-code counts.
- Process one selected local PDF at a time. A second selection replaces the first result and never combines rows across files.
- Keep all local-file processing on-device and in memory. Do not add network calls, storage, IndexedDB, cache persistence, analytics, telemetry, cloud services, authentication, sync, OCR, or a backend.
- Keep `pdfjs-dist` pinned at exactly `6.2.108`; use the existing local API bundle and matching `legacy/build/pdf.worker.min.mjs`. Add no runtime or development dependency.
- Preserve the existing 50 MiB byte limit and 500-page limit through one shared `DEFAULT_PDF_LIMITS` policy.
- Do not add `file:///*`, `<all_urls>`, `tabs`, `activeTab`, `scripting`, `storage`, a service worker, or any new manifest permission. `chrome.tabs.create()` may open a packaged extension page without the `tabs` permission.
- Preserve SKU strings, leading zeroes, and meaningful punctuation. Qty remains a positive safe base-10 integer. Never invent a missing SKU or Qty.
- Use one extraction representation per scan. DOM and PDF rows must never be concatenated.
- Keep warnings generic and text-safe. Render with `textContent`, not `innerHTML`; never expose raw parser errors.
- A complete result downloads normally. A partial result requires explicit acknowledgement. Empty, inaccessible, and unsupported results never download.
- Use `npm.cmd` for npm commands in PowerShell. Do not run forced audit remediation.

---

## Source-Driven Baseline

- `package.json` pins `pdfjs-dist` `6.2.108`; `src/manifest.json` targets Chrome 125+ and requests only `downloads` plus the existing Shopee host permission.
- Chrome states that action popups close when focus moves outside and cannot be kept open. Therefore the file chooser and multi-page scan belong to a persistent extension page: https://developer.chrome.com/docs/extensions/develop/ui/add-popup
- Chrome states that opening an extension page with `chrome.tabs.create()` requires no permission. Do not add the sensitive `tabs` permission: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Chrome requires users to separately enable extensions that run on `file://` URLs. The selected design intentionally avoids this access: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- The W3C File API defines user-selected files and asynchronous `ArrayBuffer` reads. The file input is the trust boundary; its `accept` value is only a chooser hint: https://www.w3.org/TR/FileAPI/
- Microsoft documents Chrome extension APIs and manifest keys as code-compatible with Chromium Edge, subject to API support and browser testing: https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension
- PDF.js `getDocument({ data })`, text content, and worker configuration remain the existing PDF path; no new PDF API is introduced: https://mozilla.github.io/pdf.js/api/

Recheck these pages before accepting any review recommendation that adds permissions, changes the extension-page architecture, replaces the File API, or changes PDF.js integration.

## File Structure and Responsibilities

```text
src/adapters/pdf-text.ts              footer-bounded, origin-aware row parsing
src/adapters/pdf-text.test.ts         parser status and warning regression tests
src/adapters/pdf-policy.ts            shared byte/page limits and PDF magic check
src/adapters/pdf-policy.test.ts       exact shared policy tests
src/adapters/pdf-document.ts          PDF.js bytes-to-positioned-text conversion
src/content/pdf-source.ts             Shopee-only PDF discovery and bounded fetch
src/content/pipeline.ts               DOM/PDF candidate selection only
src/core/scan-result.ts               adapter normalization, warning policy, aggregation
src/core/scan-result.test.ts          source-independent ScanResult contract tests
src/ui/scan-result.ts                 shared result view model and text-safe rendering
src/ui/scan-result.test.ts            complete/partial/error and XSS-safe UI tests
src/browser/csv-download.ts           shared CSV authorization and Blob download boundary
src/browser/csv-download.test.ts      download, acknowledgement, failure, and revocation tests
src/local-pdf/file.ts                 selected File size/read/signature boundary
src/local-pdf/file.test.ts            empty/oversized/unreadable/non-PDF/success tests
src/local-pdf/pipeline.ts             local bytes -> PDF.js -> adapter -> ScanResult
src/local-pdf/pipeline.test.ts        local scan status and fail-closed tests
src/local-pdf/controller.ts           local page state, acknowledgement, and download
src/local-pdf/controller.test.ts      replacement, busy, validation, and download states
src/local-pdf/index.ts                browser ports and PDF.js worker setup
src/local-pdf/local-pdf.html          persistent accessible one-file scan page
src/local-pdf/local-pdf.css           persistent page layout and focus styles
src/popup/controller.ts               active AWB scan plus local-page launch action
src/popup/index.ts                    Chrome popup port wiring
src/popup/popup.html                  two explicit popup actions
scripts/build.ts                      package popup, content, local page, worker, and license
scripts/verify-resi.ts                count-only private fixture summary
tests/fixtures/pdf-text.ts            synthetic wrapped/footer and malformed PDF layouts
tests/manifest-source.test.ts         unchanged minimal source permission assertions
tests/manifest-build.test.ts          local page assets and bundle policy assertions
tests/verify-resi.test.ts             private harness output-policy tests
README.md                              user workflow, privacy, permissions, and limitations
docs/superpowers/verification/
  2026-08-04-shopee-awb-local-pdf-and-warning-accuracy.md
                                       actual verification evidence and manual gaps
```

Delete `src/popup/ui.ts` and `src/popup/ui.test.ts` only after their behavior and tests have moved to `src/ui/scan-result.ts` and `src/ui/scan-result.test.ts`. Generated `dist/` remains untracked.

## Shared Interfaces

Later tasks consume these exact names rather than creating parallel contracts:

```ts
// src/core/scan-result.ts
export function normalizeAdapterResult(value: AdapterResult): AdapterResult;
export function buildScanResult(value: AdapterResult): ScanResult;

// src/adapters/pdf-policy.ts
export interface PdfLimits {
  maxBytes: number;
  maxPages: number;
}
export const DEFAULT_PDF_LIMITS: PdfLimits;
export function hasPdfMagic(bytes: Uint8Array): boolean;

// src/ui/scan-result.ts
export type ScanSurface = 'awb' | 'local-pdf';
export interface ScanViewModel {
  statusText: string;
  summaryLines: string[];
  warningLines: string[];
  showAcknowledgement: boolean;
  canDownload: boolean;
  downloadLabel: 'Download CSV' | 'Download partial result';
}
export function deriveScanViewModel(
  result: ScanResult | null,
  partialAcknowledged: boolean,
  surface: ScanSurface,
): ScanViewModel;
export function renderScanView(model: ScanViewModel, root: Document): void;
export const scanResultElementIds: Readonly<Record<string, string>>;

// src/browser/csv-download.ts
export interface CsvDownloadPorts {
  download(options: chrome.downloads.DownloadOptions): Promise<number>;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  now(): Date;
}
export type CsvDownloadOutcome =
  | 'started'
  | 'acknowledgement-required'
  | 'unavailable'
  | 'failed';
export function downloadScanCsv(
  result: ScanResult | null,
  partialAcknowledged: boolean,
  ports: CsvDownloadPorts,
): Promise<CsvDownloadOutcome>;

// src/local-pdf/file.ts
export interface LocalPdfFile {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type LocalPdfFileErrorCode =
  | 'EMPTY_FILE'
  | 'PDF_TOO_LARGE'
  | 'INVALID_PDF_TYPE'
  | 'INACCESSIBLE_SOURCE';
export class LocalPdfFileError extends Error {
  readonly code: LocalPdfFileErrorCode;
}
export function readLocalPdfBytes(
  file: LocalPdfFile,
  limits?: PdfLimits,
): Promise<Uint8Array>;

// src/local-pdf/pipeline.ts
export interface LocalPdfDependencies {
  readBytes(file: LocalPdfFile): Promise<Uint8Array>;
  readPdf(data: Uint8Array): Promise<PdfTextDocument>;
  extractPdf(document: PdfTextDocument): AdapterResult;
}
export function scanLocalPdf(
  file: LocalPdfFile,
  dependencies: LocalPdfDependencies,
): Promise<ScanResult>;
```

## Task 1: Correct PDF row boundaries and wrapped-name classification

**Files:**

- Modify: `tests/fixtures/pdf-text.ts`
- Modify: `src/adapters/pdf-text.test.ts`
- Modify: `src/adapters/pdf-text.ts:126-516`

**Interfaces:**

- Consumes: existing `PdfTextDocument`, positioned items, header anchors, column bands, SKU normalization, and Qty parsing.
- Produces: the unchanged `extractPdfTextRows(document: PdfTextDocument): AdapterResult` contract with accurate row warnings.

- [ ] **Step 1: Add the failing wrapped-name and footer regression fixture.** Add a synthetic fixture named `wrappedProductAndFooterPdfDocument()` with one valid row, two following product-name-only visual groups, a mixed-case whitespace-padded `Pesan:` footer group, and later footer items. Make the wrapped item widths cross the SKU band while their origins remain in the product column. Use only synthetic values:

  ```ts
  export function wrappedProductAndFooterPdfDocument(): PdfTextDocument {
    return {
      pageCount: 1,
      failures: [],
      pages: [
        page(1, [
          ...productHeaders(700),
          text('Synthetic Product First Line', 40, 660, 245),
          text('STANDARD-SYNTHETIC-SKU', 300, 660, 120),
          text('1', 506, 660, 8),
          text('Synthetic wrapped second line', 42, 650, 290),
          text('Synthetic wrapped third line', 42, 640, 300),
          text('  PeSaN: synthetic-footer  ', 40, 620, 150),
          text('Synthetic footer cell', 300, 620, 110),
          text('9', 506, 620, 8),
          text('Synthetic later footer', 40, 600, 160),
        ]),
      ],
    };
  }
  ```

  Add a test that expects exactly one PDF row, quantity one, `status: 'complete'`, and no warnings. Keep `unmatchedBodyContentPdfDocument()` as the distant product-only negative case and `closeMalformedBodyRowPdfDocument()` as the close multi-column malformed case.

- [ ] **Step 2: Run the focused parser test and confirm the existing bug.**

  Run:

  ```powershell
  npm.cmd test -- src/adapters/pdf-text.test.ts
  ```

  Expected: the new regression fails because wrapped/footer groups currently produce `MISSING_SKU`, `INVALID_QTY`, or `PARTIAL_EXTRACTION`; all pre-existing assertions still execute.

- [ ] **Step 3: Replace intersection-based row candidacy with origin-aware body traversal.** Keep SKU/Qty cell parsing unchanged, remove `splitIdentityGroups()` and the current one-hop `appendUnmatchedBodyWarnings()` flow, and introduce helpers with these responsibilities:

  ```ts
  function columnOrigins(group: TextGroup, bands: ColumnBands): Set<HeaderName> {
    const origins = new Set<HeaderName>();
    for (const item of group.items) {
      if (centerIsWithinBand(item, bands['nama produk'])) origins.add('nama produk');
      if (centerIsWithinBand(item, bands.variasi)) origins.add('variasi');
      if (startsWithinBand(item, bands.sku)) origins.add('sku');
      if (isWithinBand(item, bands.qty)) origins.add('qty');
    }
    return origins;
  }

  function isRowLike(group: TextGroup, bands: ColumnBands): boolean {
    const origins = columnOrigins(group, bands);
    return origins.has('sku') || origins.has('qty') || origins.size >= 2;
  }

  function isFooterGroup(group: TextGroup, bands: ColumnBands): boolean {
    return group.items.some(
      (item) =>
        centerIsWithinBand(item, bands['nama produk']) &&
        normalizeAnchor(item.str).startsWith('pesan:'),
    );
  }
  ```

  Traverse groups after the header from top to bottom. Stop at the first footer group only after at least one row-like group has been seen. Parse row-like groups with `parseIdentityGroup()`. Accept a product-name-only continuation when it follows either a parsed row or an accepted continuation within the existing height-derived tolerance; update the previous accepted group so continuation chains can exceed one line. A group that is neither row-like nor a chained continuation remains `UNSUPPORTED_LAYOUT` when it is inside the active table region and visibly belongs to a table column.

- [ ] **Step 4: Run all adapter tests and inspect warning-code expectations.**

  Run:

  ```powershell
  npm.cmd test -- src/adapters/pdf-text.test.ts src/adapters/pdf-document.test.ts
  npm.cmd run typecheck
  git diff --check
  ```

  Expected: the new fixture is complete with zero warnings; distant unmatched and genuine malformed groups remain partial; no warning message contains synthetic cell text.

- [ ] **Step 5: Commit the parser fix in the worktree.**

  ```powershell
  git add tests/fixtures/pdf-text.ts src/adapters/pdf-text.ts src/adapters/pdf-text.test.ts
  git commit -S -m "fix: bound PDF product row warnings"
  git verify-commit HEAD
  ```

## Task 2: Extract source-independent ScanResult composition

**Files:**

- Create: `src/core/scan-result.ts`
- Create: `src/core/scan-result.test.ts`
- Modify: `src/content/pipeline.ts:33-266`
- Modify: `src/content/pipeline.test.ts:264-341`

**Interfaces:**

- Consumes: `AdapterResult`, `ExtractionWarning`, `ScanResult`, `WarningCode`, and `aggregateRows()`.
- Produces: `normalizeAdapterResult(value)` and `buildScanResult(value)` from Shared Interfaces.

- [ ] **Step 1: Write focused failing tests for shared result composition.** Cover complete metrics, partial-warning normalization, filtering an invalid row from a cast runtime value, ensuring `PARTIAL_EXTRACTION` is present once, non-downloadable statuses clearing rows, and aggregation overflow mapping to generic unsupported output. Use synthetic values only:

  ```ts
  expect(
    buildScanResult({
      status: 'complete',
      labelsInspected: 1,
      rows: [{ sku: '000-SYNTHETIC', quantity: 2, labelIndex: 1, source: 'pdf' }],
      warnings: [],
    }),
  ).toMatchObject({
    status: 'complete',
    labelsInspected: 1,
    rowsDetected: 1,
    uniqueSkus: 1,
    totalQuantity: 2,
  });
  ```

  Run `npm.cmd test -- src/core/scan-result.test.ts` and confirm failure because the module does not exist.

- [ ] **Step 2: Move result normalization and aggregation without changing behavior.** Move the warning-message map, warning-code guards, row guards, `normalizeWarnings()`, `normalizeAdapterResult()`, and the aggregation portion of `resultFromCandidate()` from `src/content/pipeline.ts` into `src/core/scan-result.ts`. Implement `buildScanResult()` so it accepts one adapter result and never knows about DOM/PDF candidate precedence:

  ```ts
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
      return aggregationFailureResult(error, adapter.labelsInspected);
    }
  }
  ```

  Keep `inaccessibleResult()`, `unsupportedResult()`, frame discovery, candidate ranking, and candidate selection in the content pipeline. Replace `resultFromCandidate(candidate)` with `buildScanResult(candidate.result)`.

- [ ] **Step 3: Run core and content-pipeline tests.**

  ```powershell
  npm.cmd test -- src/core/scan-result.test.ts src/content/pipeline.test.ts
  npm.cmd run typecheck
  npm.cmd run lint
  git diff --check
  ```

  Expected: source-independent tests pass and all existing candidate-precedence tests remain unchanged.

- [ ] **Step 4: Commit the shared result boundary.**

  ```powershell
  git add src/core/scan-result.ts src/core/scan-result.test.ts src/content/pipeline.ts src/content/pipeline.test.ts
  git commit -S -m "refactor: share scan result composition"
  git verify-commit HEAD
  ```

## Task 3: Centralize PDF limits and signature policy

**Files:**

- Create: `src/adapters/pdf-policy.ts`
- Create: `src/adapters/pdf-policy.test.ts`
- Modify: `src/adapters/pdf-document.ts:1-4`
- Modify: `src/content/pdf-source.ts:1-36,278-332`
- Modify: `src/content/pdf-source.test.ts:1-320`
- Modify: `scripts/verify-resi.ts:1-12`
- Modify: `tests/verify-resi.test.ts:1-9`

**Interfaces:**

- Consumes: raw `Uint8Array` input.
- Produces: `PdfLimits`, `DEFAULT_PDF_LIMITS`, and `hasPdfMagic()` from Shared Interfaces.

- [ ] **Step 1: Write failing policy tests.** Assert the exact limits, the `%PDF-` bytes, rejection of shorter/wrong prefixes through a false return, and no mutation:

  ```ts
  expect(DEFAULT_PDF_LIMITS).toEqual({
    maxBytes: 50 * 1024 * 1024,
    maxPages: 500,
  });
  expect(hasPdfMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
  expect(hasPdfMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false);
  ```

  Run `npm.cmd test -- src/adapters/pdf-policy.test.ts` and observe the missing-module failure.

- [ ] **Step 2: Implement the policy and remove the adapter-to-content dependency.** Move only the limits interface, exact constants, and PDF magic check into `src/adapters/pdf-policy.ts`:

  ```ts
  export interface PdfLimits {
    maxBytes: number;
    maxPages: number;
  }

  export const DEFAULT_PDF_LIMITS: PdfLimits = {
    maxBytes: 50 * 1024 * 1024,
    maxPages: 500,
  };

  const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

  export function hasPdfMagic(bytes: Uint8Array): boolean {
    return PDF_MAGIC.every((value, index) => bytes[index] === value);
  }
  ```

  Update PDF document reading, Shopee PDF fetching, the private harness, and their tests to import from the adapter policy. Preserve Shopee fetch behavior: a correct `application/pdf` response may still pass without magic, while the later local-file boundary will require magic explicitly.

- [ ] **Step 3: Verify the shared policy without behavior drift.**

  ```powershell
  npm.cmd test -- src/adapters/pdf-policy.test.ts src/adapters/pdf-document.test.ts src/content/pdf-source.test.ts tests/verify-resi.test.ts
  npm.cmd run typecheck
  git diff --check
  ```

- [ ] **Step 4: Commit the policy boundary.**

  ```powershell
  git add src/adapters/pdf-policy.ts src/adapters/pdf-policy.test.ts src/adapters/pdf-document.ts src/content/pdf-source.ts src/content/pdf-source.test.ts scripts/verify-resi.ts tests/verify-resi.test.ts
  git commit -S -m "refactor: share PDF input policy"
  git verify-commit HEAD
  ```

## Task 4: Share result presentation and CSV download authorization

**Files:**

- Create: `src/ui/scan-result.ts`
- Create: `src/ui/scan-result.test.ts`
- Create: `src/browser/csv-download.ts`
- Create: `src/browser/csv-download.test.ts`
- Modify: `src/popup/controller.ts:1-141`
- Modify: `src/popup/controller.test.ts:1-274`
- Modify: `src/popup/index.ts:1-43`
- Delete after migration: `src/popup/ui.ts`
- Delete after migration: `src/popup/ui.test.ts`

**Interfaces:**

- Consumes: `ScanResult`, existing aggregation/CSV functions, and injected browser download ports.
- Produces: `deriveScanViewModel()`, `renderScanView()`, `scanResultElementIds`, and `downloadScanCsv()` from Shared Interfaces.

- [ ] **Step 1: Move the UI tests first and add the local-surface copy case.** Preserve complete, partial, non-downloadable, and text-safe rendering assertions. Add:

  ```ts
  expect(deriveScanViewModel(null, false, 'local-pdf').statusText).toBe(
    'Choose a downloaded Shopee AWB PDF.',
  );
  expect(
    deriveScanViewModel(result('unsupported'), false, 'local-pdf').statusText,
  ).toContain('supported product table');
  ```

  Run `npm.cmd test -- src/ui/scan-result.test.ts` and confirm it fails before the shared module exists.

- [ ] **Step 2: Move the popup view logic into the shared UI module.** Keep the existing element IDs and `textContent` rendering. Add the `surface` argument only to select ready/unsupported copy; summary, warning, acknowledgement, and download rules remain identical. Update popup imports to use `deriveScanViewModel(result, acknowledged, 'awb')` and `renderScanView()`.

- [ ] **Step 3: Write failing shared download tests.** Move the existing exact CSV/Blob/revocation assertions from the popup controller test and cover all outcomes:

  ```ts
  await expect(downloadScanCsv(completeResult, false, ports)).resolves.toBe('started');
  await expect(downloadScanCsv(partialResult, false, ports)).resolves.toBe(
    'acknowledgement-required',
  );
  await expect(downloadScanCsv(partialResult, true, rejectingPorts)).resolves.toBe('failed');
  await expect(downloadScanCsv(unsupportedResult, false, ports)).resolves.toBe('unavailable');
  ```

  Run `npm.cmd test -- src/browser/csv-download.test.ts` and observe the missing-module failure.

- [ ] **Step 4: Extract the exact download boundary.** Move aggregation, CSV bytes, Blob creation, timestamped filename, `saveAs: true`, and `finally` revocation from the popup controller into `downloadScanCsv()`. The function must not render UI or retain the object URL. Update the popup controller to translate outcomes into its existing status messages.

- [ ] **Step 5: Verify shared and popup behavior, then remove old UI files.**

  ```powershell
  npm.cmd test -- src/ui/scan-result.test.ts src/browser/csv-download.test.ts src/popup/controller.test.ts
  npm.cmd run typecheck
  npm.cmd run lint
  git diff --check
  ```

  Confirm `rg -n "popup/ui" src tests` returns no references before deleting the old files.

- [ ] **Step 6: Commit the shared browser boundaries.**

  ```powershell
  git add src/ui/scan-result.ts src/ui/scan-result.test.ts src/browser/csv-download.ts src/browser/csv-download.test.ts src/popup/controller.ts src/popup/controller.test.ts src/popup/index.ts src/popup/ui.ts src/popup/ui.test.ts
  git commit -S -m "refactor: share scan result UI and download"
  git verify-commit HEAD
  ```

## Task 5: Implement the selected-file and local-PDF pipeline boundaries

**Files:**

- Create: `src/local-pdf/file.ts`
- Create: `src/local-pdf/file.test.ts`
- Create: `src/local-pdf/pipeline.ts`
- Create: `src/local-pdf/pipeline.test.ts`

**Interfaces:**

- Consumes: `PdfLimits`, `DEFAULT_PDF_LIMITS`, `hasPdfMagic()`, `readPdfTextDocument()`, `extractPdfTextRows()`, and `buildScanResult()`.
- Produces: `LocalPdfFile`, `LocalPdfFileError`, `readLocalPdfBytes()`, `LocalPdfDependencies`, and `scanLocalPdf()` from Shared Interfaces.

- [ ] **Step 1: Write failing selected-file boundary tests.** Use synthetic file doubles with no names or paths. Cover zero bytes, declared size above the limit without calling `arrayBuffer`, a rejected read, a post-read byte length above the cap, wrong magic, and successful exact-cap/read behavior:

  ```ts
  const validPdf = {
    size: 8,
    arrayBuffer: async () =>
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x30]).buffer,
  };

  await expect(readLocalPdfBytes(validPdf)).resolves.toEqual(
    new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x30]),
  );
  ```

  Assert only `LocalPdfFileError.code`; never include a filename or raw bytes in error messages. Run `npm.cmd test -- src/local-pdf/file.test.ts` and confirm the module is missing.

- [ ] **Step 2: Implement fail-closed file reading.** Check `file.size` before reading, catch `arrayBuffer()` failures as `INACCESSIBLE_SOURCE`, copy into a fresh `Uint8Array`, recheck actual byte length, and require `%PDF-` magic:

  ```ts
  export async function readLocalPdfBytes(
    file: LocalPdfFile,
    limits: PdfLimits = DEFAULT_PDF_LIMITS,
  ): Promise<Uint8Array> {
    if (!Number.isSafeInteger(file.size) || file.size <= 0) {
      throw new LocalPdfFileError('EMPTY_FILE');
    }
    if (file.size > limits.maxBytes) {
      throw new LocalPdfFileError('PDF_TOO_LARGE');
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      throw new LocalPdfFileError('INACCESSIBLE_SOURCE');
    }

    if (bytes.byteLength === 0) throw new LocalPdfFileError('EMPTY_FILE');
    if (bytes.byteLength > limits.maxBytes) throw new LocalPdfFileError('PDF_TOO_LARGE');
    if (!hasPdfMagic(bytes)) throw new LocalPdfFileError('INVALID_PDF_TYPE');
    return new Uint8Array(bytes);
  }
  ```

- [ ] **Step 3: Write failing local pipeline tests.** Inject dependencies and cover: successful complete result; PDF reader rejection mapping to generic inaccessible; adapter rejection mapping to inaccessible; unsupported text layout remaining unsupported; and `LocalPdfFileError` propagating unchanged so the controller can render an actionable validation message.

  ```ts
  await expect(scanLocalPdf(validFile, dependencies)).resolves.toMatchObject({
    status: 'complete',
    rowsDetected: 1,
    uniqueSkus: 1,
    totalQuantity: 1,
  });
  ```

- [ ] **Step 4: Implement the local pipeline with one representation.** Call `readBytes()`, `readPdf()`, `extractPdf()`, then `buildScanResult()`. Re-throw `LocalPdfFileError`; map all PDF.js/adapter exceptions to a generic inaccessible adapter result before calling `buildScanResult()`. Do not inspect the active tab, discover URLs, fetch, or persist data.

- [ ] **Step 5: Verify and commit the local core.**

  ```powershell
  npm.cmd test -- src/local-pdf/file.test.ts src/local-pdf/pipeline.test.ts src/core/scan-result.test.ts
  npm.cmd run typecheck
  npm.cmd run lint
  git diff --check
  git add src/local-pdf/file.ts src/local-pdf/file.test.ts src/local-pdf/pipeline.ts src/local-pdf/pipeline.test.ts
  git commit -S -m "feat: process selected AWB PDFs locally"
  git verify-commit HEAD
  ```

## Task 6: Add the persistent local-PDF page and popup route

**Files:**

- Create: `src/local-pdf/controller.ts`
- Create: `src/local-pdf/controller.test.ts`
- Create: `src/local-pdf/index.ts`
- Create: `src/local-pdf/local-pdf.html`
- Create: `src/local-pdf/local-pdf.css`
- Modify: `src/popup/popup.html:8-31`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/controller.ts`
- Modify: `src/popup/controller.test.ts`
- Modify: `src/popup/index.ts`
- Modify: `scripts/build.ts:44-105`
- Modify: `tests/manifest-source.test.ts:27-57`
- Modify: `tests/manifest-build.test.ts:69-122`

**Interfaces:**

- Consumes: `scanLocalPdf()`, shared scan view, shared CSV download, `chrome.runtime.getURL()`, `chrome.tabs.create()`, and the existing PDF.js worker.
- Produces: a persistent extension page opened by `PopupPorts.openLocalPdfPage(): Promise<void>` and `createLocalPdfController()` with `selectFile()`, `acknowledgePartial()`, and `download()` methods.

- [ ] **Step 1: Write failing popup-route tests.** Add `openLocalPdfPage()` to the popup port double and a `choose-pdf-button` to the test shell. Assert the controller opens the page exactly once, maps rejection to generic status text, and disables both launch and scan actions during an active AWB scan. Add this return method:

  ```ts
  return {
    scan,
    openLocalPdf,
    acknowledgePartial,
    download,
  };
  ```

  Run `npm.cmd test -- src/popup/controller.test.ts` and observe the missing port/control behavior.

- [ ] **Step 2: Implement popup routing without a permission change.** Add these controls and ports:

  ```html
  <button id="scan-button" type="button">Scan current AWB</button>
  <button id="choose-pdf-button" type="button">Choose downloaded PDF</button>
  ```

  ```ts
  openLocalPdfPage: async () => {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('local-pdf/local-pdf.html'),
    });
  },
  ```

  Do not modify `src/manifest.json`. Keep the existing active-page URL gate and content message flow.

- [ ] **Step 3: Write failing local controller tests.** Build a jsdom shell with one non-multiple file input plus the shared status/summary/warnings/acknowledgement/download IDs. Cover:

  - ready copy before selection;
  - null selection remaining ready;
  - controls disabled during a pending scan;
  - complete result and download;
  - partial acknowledgement reset on every new selection;
  - second selection replacing, not combining with, the first result;
  - `EMPTY_FILE`/`INVALID_PDF_TYPE` -> `Choose a valid PDF file.`;
  - `PDF_TOO_LARGE` -> `The PDF exceeds the 50 MiB limit.`;
  - `INACCESSIBLE_SOURCE` -> `The selected PDF could not be read.`;
  - generic scan rejection without raw error text; and
  - CSV download failure retaining the current result.

  Run `npm.cmd test -- src/local-pdf/controller.test.ts` and confirm the missing implementation failure.

- [ ] **Step 4: Implement the local controller and accessible page shell.** Use one file input without `multiple`:

  ```html
  <input id="pdf-file" type="file" accept="application/pdf,.pdf" />
  ```

  On selection, clear result and acknowledgement, render processing state, await `scanLocalPdf()`, and render through `deriveScanViewModel(result, acknowledged, 'local-pdf')`. Use status overrides only for selected-file validation and download failure. Never display `File.name` or a local path. Reuse `downloadScanCsv()`.

- [ ] **Step 5: Wire PDF.js and browser ports in `src/local-pdf/index.ts`.** Configure the same worker URL as the content entry point, adapt `getDocument` to `PdfJsGetDocument`, and construct dependencies explicitly:

  ```ts
  GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    'vendor/pdf.worker.min.mjs',
  );

  const dependencies: LocalPdfDependencies = {
    readBytes: (file) => readLocalPdfBytes(file),
    readPdf: (data) => readPdfTextDocument(data, getDocumentImpl),
    extractPdf: extractPdfTextRows,
  };
  ```

  Attach `change`, acknowledgement, and download listeners from the packaged script only; use no inline script.

- [ ] **Step 6: Package and test the persistent page.** Extend build preflight, bundle `src/local-pdf/index.ts` to `dist/local-pdf/local-pdf.js`, and copy HTML/CSS. In `tests/manifest-build.test.ts`, assert all three bundles and local page assets exist, contain no remote executable URL, and package no native `.node` binary. In source and built manifest tests, assert permissions and host permissions remain exactly unchanged and JSON contains neither `file://` nor `<all_urls>`.

- [ ] **Step 7: Run focused UI, build, and dist tests.**

  ```powershell
  npm.cmd test -- src/local-pdf/controller.test.ts src/popup/controller.test.ts src/ui/scan-result.test.ts src/browser/csv-download.test.ts tests/manifest-source.test.ts
  npm.cmd run build
  npm.cmd run test:dist
  npm.cmd run typecheck
  npm.cmd run lint
  git diff --check
  ```

- [ ] **Step 8: Commit the complete browser workflow.**

  ```powershell
  git add src/local-pdf src/popup src/ui src/browser scripts/build.ts tests/manifest-source.test.ts tests/manifest-build.test.ts
  git commit -S -m "feat: add local AWB PDF scan page"
  git verify-commit HEAD
  ```

## Task 7: Extend privacy-safe verification and user documentation

**Files:**

- Modify: `scripts/verify-resi.ts`
- Modify: `tests/verify-resi.test.ts`
- Modify: `README.md`
- Create: `docs/superpowers/verification/2026-08-04-shopee-awb-local-pdf-and-warning-accuracy.md`

**Interfaces:**

- Consumes: the completed parser, local page, build, and private count-only harness.
- Produces: aggregate verification evidence only; no raw file, row, SKU, order, tracking, address, or customer data.

- [ ] **Step 1: Add warning-code counts to the private summary contract.** Extend `FixtureSummary` with a sorted `warningCodeCounts: Partial<Record<WarningCode, number>>`. Build it from generic warning codes only:

  ```ts
  const warningCodeCounts = Object.fromEntries(
    [...new Set(adapterResult.warnings.map((warning) => warning.code))]
      .sort()
      .map((code) => [
        code,
        adapterResult.warnings.filter((warning) => warning.code === code).length,
      ]),
  );
  ```

  Add a synthetic test that serializes the summary and asserts it contains only the approved key set and no synthetic SKU text. Keep the real file out of automated tests.

- [ ] **Step 2: Update README workflows and limitations.** Document:

  - `Scan current AWB` for an authenticated Shopee page;
  - `Choose downloaded PDF` opening a persistent page;
  - one PDF per scan and replacement on second selection;
  - the 50 MiB and 500-page limits;
  - no file-URL access, no new permission, no network/storage, and no cross-browser tab access;
  - text-layer PDFs only, no OCR;
  - complete versus acknowledged partial download behavior; and
  - the Chrome popup, Tabs API, permission, File API, Edge compatibility, and PDF.js official sources from the approved spec.

- [ ] **Step 3: Run the complete automated and private verification set.**

  ```powershell
  npm.cmd run verify
  npm.cmd run verify:fixture -- "D:\Downloads\RESI.pdf"
  npm.cmd audit --omit=dev --audit-level=high
  git diff --check
  git ls-files "*.pdf"
  git status --short
  ```

  Expected: all automated checks pass; audit reports no unmitigated reachable high/critical finding; no PDF is tracked; the fixture command emits only page/label/row/SKU-count/quantity/warning-count/status fields and generic warning-code counts. Do not claim that every remaining private-fixture warning is genuine until its structure has a synthetic equivalent.

- [ ] **Step 4: Perform Chrome and Edge manual checks without exposing data.** In both browsers, load `dist` unpacked and record pass/fail only for:

  1. existing authenticated Shopee page scan and CSV download;
  2. local page opened by `Choose downloaded PDF`;
  3. file chooser remains one-file-only;
  4. local fixture processing completes without the popup lifecycle interrupting it;
  5. observed one-label case reports one row, quantity one, and zero warnings;
  6. second selection replaces the first result;
  7. partial download remains blocked until acknowledgement;
  8. source and built extension show no new permission or file-URL access; and
  9. DevTools shows no network request from the local-PDF page.

  If browser automation/control is unavailable, record these checks as unverified with the exact limitation and do not replace them with static evidence.

- [ ] **Step 5: Write the verification record from actual evidence.** Include command names, exit status, test/file counts, aggregate private-fixture counts, warning-code counts, manifest permissions, built asset names, audit result, browser versions, and explicit manual gaps. Do not include raw warnings, filenames beyond the already approved fixture path, extracted text, or identifiers.

- [ ] **Step 6: Commit verification and documentation in the worktree.**

  ```powershell
  git add scripts/verify-resi.ts tests/verify-resi.test.ts README.md docs/superpowers/verification/2026-08-04-shopee-awb-local-pdf-and-warning-accuracy.md
  git commit -S -m "docs: verify local AWB PDF scanning"
  git verify-commit HEAD
  ```

## Task 8: Review the completed branch and prepare signed main integration

**Files:**

- Review: all changes from the approved plan base through worktree `HEAD`
- Modify only when required by verified review findings
- Do not merge, squash, rebase, push, or delete the worktree without explicit user approval at the finishing gate

**Interfaces:**

- Consumes: all task commits, the approved specification, actual verification record, and current official sources.
- Produces: a reviewed, verified feature branch ready for an explicitly approved signed integration path.

- [ ] **Step 1: Run Superpowers review with source verification.** Invoke `superpowers:requesting-code-review`. For every reviewer claim, inspect the actual code and tests; use `agent-skills:source-driven-development` for browser, permission, File API, Edge, and PDF.js claims. Reject unsupported scope expansion.

- [ ] **Step 2: Fix only confirmed Critical or Important findings with TDD.** For each accepted finding, write or update a focused failing test, observe failure, implement the smallest fix, rerun focused and broader tests, and create a GPG-signed worktree commit:

  ```powershell
  git add <exact-reviewed-files>
  git commit -S -m "fix: address local PDF review findings"
  git verify-commit HEAD
  ```

  Omit this commit when no accepted finding requires a change.

- [ ] **Step 3: Run verification-before-completion.** Invoke `superpowers:verification-before-completion`, then rerun:

  ```powershell
  npm.cmd run verify
  npm.cmd run verify:fixture -- "D:\Downloads\RESI.pdf"
  npm.cmd audit --omit=dev --audit-level=high
  git diff --check
  git status --short --branch
  ```

  Report manual Chrome/Edge results separately from automated checks.

- [ ] **Step 4: Stop at the branch-completion choice.** Invoke `superpowers:finishing-a-development-branch` and present the allowed integration options. Do not integrate without explicit approval. Because one earlier worktree-only documentation commit was unsigned, the selected main-integration method must prevent it from entering `main`; prefer an approved squash or recreated signed commit sequence, and verify every resulting commit immediately.

---

## Plan Completion Criteria

The implementation is complete only when:

- every acceptance criterion in `docs/superpowers/specs/2026-08-04-shopee-awb-local-pdf-and-warning-accuracy-design.md` maps to a passing automated test or an explicitly reported manual browser check;
- the observed valid one-label structure produces one row, quantity one, and zero warnings;
- genuine malformed synthetic rows remain partial and visible;
- the local page processes one selected PDF without file-URL access or new permissions;
- local and active-page flows use the same PDF adapter, result builder, result UI rules, and CSV download boundary;
- no customer/shipment data is tracked, logged, or printed;
- full verification and the native audit pass or any limitation is explicitly reported;
- every reviewer claim has been verified against repository evidence and official sources where version-sensitive; and
- the earlier unsigned worktree-only documentation commit has not entered `main`; every subsequent and final integrated commit is GPG-signed and verified.
