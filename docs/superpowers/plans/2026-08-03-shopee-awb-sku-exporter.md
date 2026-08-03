# Shopee AWB SKU Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a privacy-first Chrome and Microsoft Edge Manifest V3 extension that scans Shopee Seller Center AWB print documents, aggregates positive quantities by SKU in first-seen order, and downloads a UTF-8 CSV with the exact header `SKU,Jumlah`.

**Architecture:** A narrowly matched content script validates the active Shopee AWB route, inspects accessible DOM documents first, and uses a locally bundled PDF.js text-layer adapter only when no complete DOM representation is available and a same-origin PDF source is reachable. Exactly one representation feeds pure normalization, aggregation, and CSV modules. A minimal popup owns scanning, warning acknowledgement, and the explicit download action; extracted data remains in memory only.

**Tech Stack:** TypeScript, npm, esbuild, Vitest, jsdom, PDF.js display API, ESLint flat config, Prettier, Chrome/Edge Manifest V3 APIs, and minimal HTML/CSS.

**Approval gate:** This plan is awaiting explicit user approval. Do not scaffold, install dependencies, create an implementation worktree, or implement any task before approval.

## Global Constraints

- After approval, start execution with `superpowers:using-git-worktrees` and create the execution worktree under this repository's `.worktrees/` directory. The plan itself remains reviewed and committed on root `main`.
- Use `superpowers:test-driven-development` for every behavior change: add one focused failing test, observe the intended failure, implement the smallest passing behavior, and rerun the focused and broader relevant tests.
- Use Conventional Commits. Every new commit must use `git commit -S`; run `git verify-commit HEAD` immediately afterward. Do not push, configure a remote, or publish anything.
- Keep `D:\Downloads\RESI.pdf` outside Git. Never print, snapshot, log, document, or commit extracted label text, names, addresses, phone numbers, order numbers, tracking numbers, or other customer/shipment data. The local harness may output only status and integer counts.
- Keep all processing on-device. Do not add analytics, telemetry, cloud services, backend calls, authentication, sync, extension storage, OCR, or unrelated marketplace support.
- Do not request `<all_urls>`, unrelated host access, `tabs`, `scripting`, `storage`, or a service worker unless a verified browser constraint makes one necessary and the user separately approves the permission/architecture change.
- Preserve SKU values as strings. Trim/collapse layout whitespace only; preserve leading zeroes and meaningful punctuation. Accept Qty only as a positive, safe, base-10 integer.
- Preserve formula-leading SKU characters unchanged under the approved exact-value contract. Do not silently prefix apostrophes or otherwise rewrite cells as a spreadsheet-injection workaround. Document that exports should be treated as trusted seller data and that the SKU column should be imported as text; changing this policy requires a specification amendment.
- Use one extraction representation per scan. A DOM result and a PDF result must never be concatenated or jointly aggregated.
- Treat `labelIndex` as one-based in adapter results and warnings. Warning messages must be generic and must not include raw source text.
- A `partial` result with valid rows may be downloaded only after explicit acknowledgement. `empty`, `inaccessible`, and `unsupported` results never expose a download action.
- Use `npm.cmd` for npm commands in PowerShell. Do not run forced audit remediation or introduce dependencies beyond those listed here without approval.

---

## File Structure and Responsibilities

```text
package.json                         npm scripts and pinned dependency declarations
package-lock.json                    reproducible resolved dependency graph
.npmrc                              block dependency lifecycle scripts by default
tsconfig.json                        strict browser/Node TypeScript configuration
vitest.config.ts                     jsdom/Node test routing and coverage exclusions
vitest.dist.config.ts                post-build artifact test routing
eslint.config.mjs                    flat ESLint configuration
.prettierrc.json                     repository formatting rules
.prettierignore                      generated/local path exclusions
scripts/build.ts                     deterministic dist assembly with esbuild
scripts/verify-resi.ts               count-only local RESI.pdf verification harness
src/manifest.json                    minimal MV3 policy and entry points
src/core/types.ts                    normalized rows, warnings, statuses, and summaries
src/core/normalize.ts                SKU whitespace handling and Qty validation
src/core/aggregate.ts                first-seen duplicate-SKU aggregation
src/core/csv.ts                      BOM/CRLF CSV bytes and deterministic filename
src/core/url.ts                      exact supported AWB URL gate
src/adapters/dom.ts                  structured DOM/accessibility row extraction
src/adapters/pdf-text.ts             coordinate-aware PDF text-item row extraction
src/adapters/pdf-document.ts         PDF.js bytes-to-positioned-text conversion
src/content/documents.ts             accessible same-origin document discovery
src/content/pdf-source.ts            PDF candidate validation and bounded byte loading
src/content/pipeline.ts              adapter precedence and ScanResult composition
src/content/index.ts                 Chrome runtime message boundary and PDF worker setup
src/shared/messages.ts               typed popup/content messages and runtime guards
src/popup/popup.html                 accessible popup structure
src/popup/popup.css                  compact popup presentation and state styling
src/popup/ui.ts                      pure view-state derivation and safe rendering
src/popup/controller.ts              injected popup scan/download state machine
src/popup/index.ts                   tab messaging, acknowledgement, and download wiring
tests/fixtures/dom.ts                synthetic, non-customer DOM fixtures
tests/fixtures/pdf-text.ts           synthetic positioned PDF text fixtures
tests/pdfjs-browser-bundle.test.ts   no-output browser bundle compatibility smoke test
tests/manifest-source.test.ts        source manifest policy assertions
tests/manifest-build.test.ts         post-build manifest and asset assertions
docs/superpowers/verification/
  2026-08-03-shopee-awb-sku-exporter.md
                                      command and manual-browser verification record
README.md                             build, installation, privacy, and limitations
THIRD_PARTY_NOTICES.md                bundled PDF.js version, license, and source notice
```

Tests for production modules live beside the module as `*.test.ts`; only reusable synthetic fixtures live under `tests/fixtures/`. Generated `dist/`, coverage, dependencies, worktrees, PDFs, and local fixture output remain ignored.

## Source-Driven Toolchain Baseline

- Review environment: Node `22.22.0`, npm `11.4.1`, Git `2.52.0`, and GnuPG `2.4.5`.
- Pin `pdfjs-dist@6.2.108`; its registry metadata requires Node `>=22.13.0 || >=24`, and PDF.js requires its API bundle and worker to use the same version. Use the package's `legacy/build/pdf.mjs` API and matching `legacy/build/pdf.worker.min.mjs` worker in both Chromium browsers and the Node fixture harness: PDF.js's current support table explicitly covers Chrome 125+, Chromium Edge, and Node 22+ for that build.
- PDF.js declares `@napi-rs/canvas` as an optional Node dependency. Allow the lockfile to resolve that transitive package for the Node fixture harness, but add a browser-bundle smoke test and built-artifact check proving that no native canvas binary or Node-only loader is packaged in `dist/`. Copy PDF.js's Apache-2.0 license into the distributable and record it in `THIRD_PARTY_NOTICES.md`.
- Pin `jsdom@29.1.1`, not `30.0.1`: version 29 supports Node `^22.13.0`, while version 30 requires Node `^22.22.2` and is incompatible with the current `22.22.0` runtime.
- Pin `typescript@6.0.2` because `typescript-eslint@8.65.0` declares TypeScript support below `6.1.0`; do not resolve the incompatible TypeScript 7 latest tag.
- Current Chrome documentation confirms static content-script match patterns, isolated-world execution, `runtime.getURL()` for packaged assets, and origin-scoped `web_accessible_resources`. Current PDF.js API documentation confirms `getDocument({ data })`, positioned `TextItem` geometry, worker configuration, and bounded resource options.
- Chrome documents that matching host permissions expose the matching active tab's URL without the broad `tabs` permission, that asynchronous message handlers can portably keep the channel open by returning literal `true`, and that `downloads.download()` resolves when a download starts. The API reference does not explicitly promise `blob:` URL compatibility, so the Blob flow remains a required Chrome-and-Edge manual gate rather than a documentation-proven claim.
- `@firecrawl/pdf-inspector-wasm@0.1.3` was reviewed but is not selected for v1. Its published browser API exposes classification, Markdown, and flattened text rather than the positioned text-item contract this deterministic SKU/Qty parser requires; the native N-API package cannot run in a browser extension. The WASM package also adds an approximately 4.85 MB unpacked payload and requires an explicit Manifest V3 `wasm-unsafe-eval` CSP plus a worker/integration path. Replacing PDF.js therefore requires a separately approved design amendment and a count-only private-fixture spike; do not substitute it during plan execution.
- Recheck these exact versions and APIs against the lockfile and official sources before changing any dependency. Material sources:
  - https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
  - https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
  - https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources
  - https://developer.chrome.com/docs/extensions/reference/api/tabs
  - https://developer.chrome.com/docs/extensions/develop/concepts/messaging
  - https://developer.chrome.com/docs/extensions/reference/api/downloads
  - https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
  - https://github.com/mozilla/pdf.js/wiki/frequently-asked-questions
  - https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs
  - https://www.npmjs.com/package/pdfjs-dist
  - https://github.com/firecrawl/pdf-inspector/blob/main/wasm/README.md
  - https://github.com/firecrawl/pdf-inspector/blob/main/wasm/src/lib.rs
  - https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
  - https://docs.npmjs.com/cli/v11/commands/npm-query
  - https://docs.npmjs.com/cli/v11/commands/npm-audit

## Shared Contracts

`src/core/types.ts` is the single source of truth. Later tasks consume these exact names rather than redefining lookalike types:

```ts
export type ProductSource = 'dom' | 'pdf';

export type WarningCode =
  | 'MISSING_SKU'
  | 'AMBIGUOUS_SKU'
  | 'INVALID_QTY'
  | 'INACCESSIBLE_SOURCE'
  | 'UNSUPPORTED_LAYOUT'
  | 'PARTIAL_EXTRACTION';

export type ScanStatus =
  | 'complete'
  | 'partial'
  | 'empty'
  | 'inaccessible'
  | 'unsupported';

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
  | { ok: true; value: number }
  | { ok: false; code: 'INVALID_QTY' };
```

## Task 1: Establish the toolchain, contracts, and normalization boundary

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `.npmrc`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `vitest.dist.config.ts`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `src/core/types.ts`
- Create: `src/core/normalize.test.ts`
- Create: `src/core/normalize.ts`

**Interfaces:**

- Consumes: the approved `ProductRow`, warning, status, and `ScanResult` design contracts.
- Produces: the shared contracts above, `normalizeSku(raw: string): string`, and `parseQuantity(raw: string): QuantityParseResult`.

- [ ] **Step 1: Create the reproducible npm and TypeScript configuration.** Use this package-script surface:

  ```json
  {
    "name": "shopee-awb-sku-exporter",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "packageManager": "npm@11.4.1",
    "engines": {
      "node": "^22.13.0 || >=24.0.0"
    },
    "scripts": {
      "build": "tsx scripts/build.ts",
      "deps:prepare": "npm rebuild esbuild --ignore-scripts=false",
      "test": "vitest run",
      "test:dist": "vitest run --config vitest.dist.config.ts",
      "test:watch": "vitest",
      "typecheck": "tsc --noEmit",
      "lint": "eslint .",
      "format:check": "prettier --check .",
      "verify:fixture": "tsx scripts/verify-resi.ts",
      "verify": "npm run format:check && npm run typecheck && npm run lint && npm test && npm run build && npm run test:dist"
    }
  }
  ```

  Put `ignore-scripts=true`, `audit=false`, and `fund=false` in the project `.npmrc` before installation. Confirm `node --version` is at least 22 and `npm.cmd --version` is 11.4.1 or newer. Install and save exact resolved versions with dependency lifecycle scripts blocked:

  ```powershell
  npm.cmd install --save-exact --no-audit --no-fund pdfjs-dist@6.2.108
  npm.cmd install --save-dev --save-exact --no-audit --no-fund @eslint/js@10.0.1 @types/chrome@0.2.5 @types/jsdom@28.0.3 @types/node@22.20.1 esbuild@0.28.1 eslint@10.8.0 globals@17.9.0 jsdom@29.1.1 prettier@3.9.6 tsx@4.23.5 typescript@6.0.2 typescript-eslint@8.65.0 vitest@4.1.10
  ```

  Inspect declared dependency scripts before enabling any one of them:

  ```powershell
  npm.cmd query ":attr(scripts, [preinstall]), :attr(scripts, [install]), :attr(scripts, [postinstall])"
  npm.cmd run deps:prepare
  npm.cmd audit signatures
  npm.cmd audit --audit-level=high
  ```

  `deps:prepare` is approved only for the exact locked `esbuild` package needed by this build. If the query lists another lifecycle script, stop and review its locked package/version and script source before execution. Triage audit findings by reachability; do not run `npm audit fix --force`.

  Configure strict TypeScript with ES modules, `noEmit`, `DOM`, `DOM.Iterable`, and `WebWorker` libraries. Configure the default Vitest project to use jsdom where requested by DOM tests and to exclude `tests/manifest-build.test.ts`; configure `vitest.dist.config.ts` to include only that post-build test under Node. Exclude `dist`, `coverage`, `node_modules`, `.worktrees`, and `tmp` from lint and formatting.

- [ ] **Step 2: Write the shared contracts exactly once in `src/core/types.ts`.** Use the Shared Contracts block above. Do not create adapter-specific duplicates.

- [ ] **Step 3: Write failing normalization tests.** Cover these assertions plus safe-integer overflow:

  ```ts
  expect(normalizeSku('  001-ABC  ')).toBe('001-ABC');
  expect(normalizeSku('A\t\nB')).toBe('A B');
  expect(normalizeSku('  A/B-02._X  ')).toBe('A/B-02._X');
  expect(parseQuantity(' 12 ')).toEqual({ ok: true, value: 12 });
  expect(parseQuantity('0')).toEqual({ ok: false, code: 'INVALID_QTY' });
  expect(parseQuantity('-1')).toEqual({ ok: false, code: 'INVALID_QTY' });
  expect(parseQuantity('1.5')).toEqual({ ok: false, code: 'INVALID_QTY' });
  expect(parseQuantity('1e2')).toEqual({ ok: false, code: 'INVALID_QTY' });
  expect(parseQuantity('')).toEqual({ ok: false, code: 'INVALID_QTY' });
  ```

  Run `npm.cmd test -- src/core/normalize.test.ts` and confirm the failure is the missing implementation, not a configuration or syntax failure.

- [ ] **Step 4: Implement the minimum normalization behavior.** `normalizeSku` trims outer whitespace and converts each internal Unicode whitespace run to one ASCII space without numeric coercion or punctuation removal. `parseQuantity` first trims, accepts only `/^[0-9]+$/`, converts with `Number`, and succeeds only when `Number.isSafeInteger(value) && value > 0`.

- [ ] **Step 5: Verify and commit the foundation.** Run:

  ```powershell
  npm.cmd test -- src/core/normalize.test.ts
  npm.cmd run typecheck
  npm.cmd run lint
  git diff --check
  git add package.json package-lock.json .npmrc tsconfig.json vitest.config.ts vitest.dist.config.ts eslint.config.mjs .prettierrc.json .prettierignore src/core/types.ts src/core/normalize.ts src/core/normalize.test.ts
  git commit -S -m "chore: initialize extension core"
  git verify-commit HEAD
  ```

## Task 2: Aggregate valid rows in first-seen SKU order

**Files:**

- Create: `src/core/aggregate.test.ts`
- Create: `src/core/aggregate.ts`

**Interfaces:**

- Consumes: `readonly ProductRow[]` from one selected adapter representation.
- Produces: `aggregateRows(rows: readonly ProductRow[]): AggregationResult` without mutating input; throws a generic `AggregationOverflowError` rather than returning an imprecise number when a per-SKU or total sum exceeds JavaScript's safe-integer range.

- [ ] **Step 1: Write a failing aggregation test.** Use synthetic rows from both source kinds only in separate test cases. Assert that duplicate `001-ABC` rows sum, `ABC,2` remains a string, first-seen order is retained, `uniqueSkus` equals the output length, `totalQuantity` equals the sum, and the input array is unchanged. Add separate cases where a duplicate-SKU sum and the cross-SKU total exceed `Number.MAX_SAFE_INTEGER`; each must throw `AggregationOverflowError` without returning a rounded result.

  ```ts
  expect(aggregateRows(rows)).toEqual({
    rows: [
      { sku: '001-ABC', quantity: 5 },
      { sku: 'ABC,2', quantity: 1 }
    ],
    uniqueSkus: 2,
    totalQuantity: 6
  });
  ```

  Run `npm.cmd test -- src/core/aggregate.test.ts` and observe the expected missing-module/behavior failure.

- [ ] **Step 2: Implement ordered aggregation.** Iterate once, use `Map<string, number>` insertion order, and check `Number.isSafeInteger` after every per-SKU addition and total addition. Throw `AggregationOverflowError` before retaining an unsafe value; otherwise return a newly allocated ordered array. Do not re-normalize, sort, mutate rows, or merge representations here.

- [ ] **Step 3: Verify and commit.** Run the focused test, all current tests, typecheck, and `git diff --check`, then:

  ```powershell
  git add src/core/aggregate.ts src/core/aggregate.test.ts
  git commit -S -m "feat: aggregate quantities by SKU"
  git verify-commit HEAD
  ```

## Task 3: Serialize deterministic UTF-8 CSV bytes

**Files:**

- Create: `src/core/csv.test.ts`
- Create: `src/core/csv.ts`

**Interfaces:**

- Consumes: `readonly AggregatedSku[]` and a supplied `Date`.
- Produces: `escapeCsvCell(value: string): string`, `serializeCsv(rows: readonly AggregatedSku[]): Uint8Array`, and `buildCsvFilename(now: Date): string`.

- [ ] **Step 1: Write failing byte-level tests.** Assert the first bytes are `0xef`, `0xbb`, `0xbf`; decoded text is exactly `SKU,Jumlah\r\n` for no rows; every data row ends in CRLF; and commas, quotes, CR, and LF trigger standard quoting with doubled internal quotes. Verify SKU strings retain leading zeroes, punctuation, and formula-leading characters exactly; tests must make the approved no-rewrite policy explicit.

- [ ] **Step 2: Write a deterministic filename test.** With `new Date(2026, 7, 3, 14, 5, 9)`, assert `shopee-awb-sku-20260803-140509.csv`. Use local date components supplied by the `Date`; do not read locale-formatted strings or source paths.

- [ ] **Step 3: Implement CSV serialization.** Build rows as strings, quote when `/[",\r\n]/` matches, double every `"`, join with `\r\n`, include a final CRLF, prefix `\uFEFF`, and return `new TextEncoder().encode(text)`. Keep Qty as its decimal integer string.

- [ ] **Step 4: Verify and commit.** Run `npm.cmd test -- src/core/csv.test.ts`, `npm.cmd test`, typecheck, and `git diff --check`, then:

  ```powershell
  git add src/core/csv.ts src/core/csv.test.ts
  git commit -S -m "feat: serialize SKU totals as CSV"
  git verify-commit HEAD
  ```

## Task 4: Extract structured DOM rows from synthetic fixtures

**Files:**

- Create: `tests/fixtures/dom.ts`
- Create: `src/adapters/dom.test.ts`
- Create: `src/adapters/dom.ts`

**Interfaces:**

- Consumes: a `ParentNode` containing synthetic or live AWB markup and an optional one-based label offset.
- Produces: `extractDomRows(root: ParentNode, options?: { labelIndexOffset?: number }): AdapterResult` with `source: 'dom'` rows.

- [ ] **Step 1: Create only synthetic DOM fixture builders.** Include two label tables, multiple product rows, a wrapped product name, repeated layout whitespace, a leading-zero SKU, and punctuation. Add malformed cases for missing/duplicate SKU cells, zero/negative/decimal Qty, recognized empty tables, and missing anchors. Do not copy text or structure from `RESI.pdf` or an actual customer label.

- [ ] **Step 2: Write failing adapter tests.** Assert one-based label indexes and document order. Assert exact generic warning codes without raw cell values. Status rules are:

  - recognized rows with no warning: `complete`;
  - at least one valid and one rejected candidate row: `partial`, including one `PARTIAL_EXTRACTION` warning;
  - recognized table with no candidate rows: `empty`;
  - missing/conflicting anchors or all candidate rows invalid: `unsupported`;
  - no missing, ambiguous, or invalid field is converted into a row.

- [ ] **Step 3: Implement anchor-based table extraction.** Inspect `table`, `[role="table"]`, and `[role="grid"]` candidates. Normalize header text and locate case-insensitive exact labels `SKU`, `Qty`, `Nama Produk`, and `Variasi`; require unambiguous SKU and Qty columns. Read rows via cells/ARIA cells and `textContent`. Permit a row-like accessibility fallback only when the same row contains explicit, unambiguous SKU and Qty labels. Never use `innerHTML` or page script execution.

- [ ] **Step 4: Run focused and broad tests, then commit.**

  ```powershell
  npm.cmd test -- src/adapters/dom.test.ts
  npm.cmd test
  npm.cmd run typecheck
  git diff --check
  git add tests/fixtures/dom.ts src/adapters/dom.ts src/adapters/dom.test.ts
  git commit -S -m "feat: extract SKU rows from AWB DOM"
  git verify-commit HEAD
  ```

## Task 5: Extract rows from positioned PDF text without flattening columns

**Files:**

- Create: `tests/fixtures/pdf-text.ts`
- Create: `src/adapters/pdf-text.test.ts`
- Create: `src/adapters/pdf-text.ts`

**Interfaces:**

- Consumes: this PDF.js-independent positioned-text contract:

  ```ts
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
  ```

- Produces: `extractPdfTextRows(document: PdfTextDocument): AdapterResult` with `source: 'pdf'` rows and one-based page/label indexes.

- [ ] **Step 1: Build synthetic positioned-text fixtures and failing tests.** Cover one and multiple rows per page, multiple pages, wrapped product names, repeated whitespace, leading-zero/punctuated SKU strings, and adjacent text items with zero visual gap. Cover absent/duplicate anchors; missing/ambiguous SKU; missing, zero, negative, decimal, ambiguous, and malformed Qty; a recorded unreadable-page failure alongside a readable page; and a single text item spanning both SKU and Qty column bands. The spanning item must produce a warning rather than a guessed split. Valid rows plus any malformed row or page failure must be `partial`; page failures with no readable rows must be `inaccessible`.

- [ ] **Step 2: Implement coordinate grouping.** Sort items by page, then descending visual row and ascending x. Group y coordinates using a tolerance derived from item height but clamped to 2-6 PDF points. Locate an unambiguous header row containing `Nama Produk`, `Variasi`, `SKU`, and `Qty`; use midpoints between header x positions to define column bands. Treat every body y-group intersecting the SKU or Qty band as a candidate row before validating either field. A SKU-band item therefore still exposes missing/malformed Qty, and a Qty-band item still exposes missing SKU. If unmatched body content shows that a row exists but neither identity band can be isolated, add `UNSUPPORTED_LAYOUT` and prevent a `complete` result rather than silently skipping it.

- [ ] **Step 3: Preserve uncertainty.** Pass the raw Qty-band text to `parseQuantity`; never prefilter for positive values. If Qty is missing/invalid, if one text item crosses both SKU and Qty bands, if more than one Qty candidate exists in the same row band, or if the SKU band cannot be isolated, return the specific generic warning and reject that row. Convert each `PdfPageFailure` into a generic page-indexed `INACCESSIBLE_SOURCE` warning. Do not estimate character positions, split on guessed SKU formats, flatten a page to plain text, or use product names as identifiers.

- [ ] **Step 4: Apply the same status rules as the DOM adapter and verify.** Run the focused test, all tests, typecheck, and `git diff --check`, then:

  ```powershell
  git add tests/fixtures/pdf-text.ts src/adapters/pdf-text.ts src/adapters/pdf-text.test.ts
  git commit -S -m "feat: parse positioned AWB PDF text"
  git verify-commit HEAD
  ```

## Task 6: Load only bounded, reachable same-origin PDFs

**Files:**

- Create: `src/content/pdf-source.test.ts`
- Create: `src/content/pdf-source.ts`
- Create: `src/adapters/pdf-document.test.ts`
- Create: `src/adapters/pdf-document.ts`
- Create: `tests/pdfjs-browser-bundle.test.ts`
- Create: `scripts/verify-resi.ts`

**Interfaces:**

- Consumes: active-page URL, accessible documents, an injected `fetch`, PDF bytes, and an injected narrow PDF.js `getDocument`-compatible loader.
- Produces:

  ```ts
  export interface PdfSourceCandidate {
    kind: 'https' | 'blob';
    url: string;
  }

  export type PdfSourceDiscovery =
    | { status: 'found'; source: PdfSourceCandidate }
    | { status: 'none' }
    | { status: 'ambiguous' };

  export interface PdfLimits {
    maxBytes: number;
    maxPages: number;
  }

  export const DEFAULT_PDF_LIMITS: PdfLimits;
  export function discoverPdfSource(
    documents: readonly Document[],
    activePageUrl: URL
  ): PdfSourceDiscovery;
  export async function fetchPdfBytes(
    source: PdfSourceCandidate,
    activePageUrl: URL,
    fetchImpl?: typeof fetch,
    limits?: PdfLimits
  ): Promise<Uint8Array>;
  export async function readPdfTextDocument(
    data: Uint8Array,
    getDocumentImpl: PdfJsGetDocument,
    limits?: PdfLimits
  ): Promise<PdfTextDocument>;
  ```

  Define only the minimal structural `PdfJsGetDocument`/loading-task/document/page/text-item interfaces required by this boundary and its tests. Do not expose PDF.js objects outside `pdf-document.ts`.

- [ ] **Step 1: Write failing source-validation and byte-budget tests.** Accept only `https:` and `blob:` candidates whose resolved origin exactly equals `https://seller.shopee.co.id`, discovered from PDF-typed `embed`, `object[data]`, or viewer `iframe[src]` elements, or from a document whose content type is `application/pdf`. Deduplicate repeated references to the same normalized source, return `ambiguous` for multiple distinct valid candidates, and never choose one silently. Reject HTTP, credentials in URLs, lookalike hosts, arbitrary links, cross-origin blob URLs, fragments used as source tricks, and redirects. With an injected `fetch`, assert rejection for an oversized `Content-Length`, a chunked response that crosses the cap, wrong MIME plus missing `%PDF-` magic, and a redirect response; assert an exactly-at-limit PDF succeeds.

- [ ] **Step 2: Implement bounded fetching.** Set `DEFAULT_PDF_LIMITS` to 50 MiB and 500 pages. Fetch with credentials included and `redirect: 'error'`. Reject an oversized `Content-Length` before reading, enforce the same byte cap while streaming, and accept only an `application/pdf` content type or `%PDF-` magic bytes. Return generic typed errors without URL query strings or response text.

- [ ] **Step 3: Write failing PDF.js conversion and browser-bundle tests.** Mock the narrow `getDocument`/page API and assert each page is attempted once, `transform[4]`/`transform[5]` become x/y, width/height remain numeric, page count limits stop processing, cleanup/destroy run in `finally`, and no text is logged. Make one middle page throw from `getPage()` and another from `getTextContent()`; require later pages to continue, successful pages to remain available, and failures to contain only one-based page numbers plus `INACCESSIBLE_SOURCE`. In `tests/pdfjs-browser-bundle.test.ts`, call esbuild with `write: false`, `platform: 'browser'`, `format: 'iife'`, and `target: 'chrome125'` on an in-memory entry that imports the legacy PDF.js API. Require a successful JavaScript-only result and no emitted native `.node` artifact; this is a compatibility smoke test, not a generated file.

- [ ] **Step 4: Implement the PDF.js boundary.** Call the injected `getDocumentImpl({ data, useWorkerFetch: false, useWasm: false, verbosity: 0 })`, enforce the page cap before iteration, and isolate each `getPage()`/`getTextContent()` call so one unreadable page adds `PdfPageFailure` and later pages continue. Retain only text items with string `str` and numeric geometry, and return successful pages plus failures in `PdfTextDocument`. A document-load failure before page iteration remains a whole-source inaccessible error. Supplying bytes prevents PDF.js from independently fetching the source; disabling worker resource fetches and WASM keeps this text-only path inside the packaged JavaScript/worker boundary. Keep `pdf-document.ts` free of a top-level PDF.js runtime import. The browser entry point later injects `getDocument` from `pdfjs-dist/legacy/build/pdf.mjs`; the Node-only fixture harness imports that same legacy API, matching PDF.js's official Node example. Configure the browser worker later with `chrome.runtime.getURL('vendor/pdf.worker.min.mjs')`; do not fetch a worker, CMap, font, WASM module, or script from a CDN.

- [ ] **Step 5: Add the count-only local fixture harness.** The script accepts one file path argument, enforces the byte/page caps, imports `getDocument` from `pdfjs-dist/legacy/build/pdf.mjs`, invokes PDF conversion and extraction, and writes exactly one JSON line with only these keys: `pageCount`, `labelsInspected`, `rowsDetected`, `uniqueSkus`, `totalQuantity`, `warningCount`, and `status`. For the inspected local fixture, assert `pageCount === 50`, `rowsDetected > 0`, `uniqueSkus > 0`, `rowsDetected >= uniqueSkus`, and `totalQuantity > 0`. Do not write an expected-output file.

- [ ] **Step 6: Verify the synthetic tests and private fixture.** Run:

  ```powershell
  npm.cmd test -- src/content/pdf-source.test.ts src/adapters/pdf-document.test.ts tests/pdfjs-browser-bundle.test.ts
  npm.cmd test
  npm.cmd run verify:fixture -- "D:\Downloads\RESI.pdf"
  npm.cmd run typecheck
  git diff --check
  ```

  Inspect only the count/status JSON. If extraction fails, debug through synthetic coordinate summaries or counts, never raw text.

- [ ] **Step 7: Commit code only.** Confirm `git status --short` contains no PDF or fixture output, then:

  ```powershell
  git add src/content/pdf-source.ts src/content/pdf-source.test.ts src/adapters/pdf-document.ts src/adapters/pdf-document.test.ts tests/pdfjs-browser-bundle.test.ts scripts/verify-resi.ts
  git commit -S -m "feat: load reachable AWB PDF text layers"
  git verify-commit HEAD
  ```

## Task 7: Compose URL gating, document discovery, adapter precedence, and messaging

**Files:**

- Create: `src/core/url.test.ts`
- Create: `src/core/url.ts`
- Create: `src/content/documents.test.ts`
- Create: `src/content/documents.ts`
- Create: `src/content/pipeline.test.ts`
- Create: `src/content/pipeline.ts`
- Create: `src/shared/messages.test.ts`
- Create: `src/shared/messages.ts`
- Create: `src/content/index.ts`

**Interfaces:**

- Consumes: active URL, root `Document`, DOM adapter, PDF source/loader/adapter, and Chrome runtime messages.
- Produces:

  ```ts
  export function isSupportedAwbUrl(value: string): boolean;

  export interface DocumentCollection {
    root: Document;
    frameDocuments: Document[];
    inaccessibleCandidateFrameCount: number;
  }

  export function collectAccessibleDocuments(root: Document): DocumentCollection;

  export interface ScanDependencies {
    extractDom: typeof extractDomRows;
    discoverPdf: typeof discoverPdfSource;
    fetchPdf: typeof fetchPdfBytes;
    readPdf: typeof readPdfTextDocument;
    extractPdf: typeof extractPdfTextRows;
  }

  export async function scanAwbPage(
    pageUrl: string,
    root: Document,
    dependencies: ScanDependencies
  ): Promise<ScanResult>;

  export type ScanRequest = { type: 'SCAN_REQUEST' };
  export type ScanResponse = { type: 'SCAN_RESULT'; result: ScanResult };
  ```

- [ ] **Step 1: Write exact URL-gate tests.** Accept HTTPS host `seller.shopee.co.id`, exact pathname `/awbprint`, and any query string. Reject HTTP, ports, credentials, lookalike/subdomain hosts, other paths, and `/awbprint/`.

- [ ] **Step 2: Write document-discovery tests.** Return the root separately from recursively accessible same-origin frame documents, with each `Document` included once. A frame is a print/PDF candidate only when its declared `src`, `type`, or generic title/role indicates the AWB route, a same-origin/blob PDF, or a print viewer; unrelated cross-origin frames are ignored. Catch candidate-frame access errors and increment `inaccessibleCandidateFrameCount` without exposing frame URLs. Do not mutate documents or inject page-world scripts.

- [ ] **Step 3: Write failing pipeline precedence/status tests.** Require these deterministic rules:

  1. unsupported URL returns `unsupported` without invoking adapters;
  2. evaluate the root DOM first; if it recognizes a product-table representation, use its whole result and do not merge child-frame rows;
  3. when the root is unsupported, evaluate accessible candidate frame documents separately; exactly one recognized frame may supply the DOM representation, while multiple recognized row-bearing frames are `unsupported` because completeness/non-duplication cannot be proven;
  4. an inaccessible candidate frame prevents a complete DOM result when no root representation was recognized; preserve it as `INACCESSIBLE_SOURCE` rather than ignoring it;
  5. when DOM is not complete, try one validated PDF representation; multiple distinct valid PDF candidates produce an `unsupported` PDF result and none is fetched, while any valid partial DOM result remains eligible under the normal precedence rules;
  6. prefer `complete` over `partial`, then a partial result with more valid rows, then more labels inspected, with DOM winning an exact tie;
  7. never concatenate DOM/PDF rows or silently select one of multiple ambiguous DOM-frame representations;
  8. derive `rowsDetected`, unique count, and total quantity from only the chosen rows;
  9. a partial result always includes `PARTIAL_EXTRACTION` and remains partial;
  10. no readable representation yields `inaccessible`; readable recognized content without rows yields `empty`; conflicting/missing layout anchors yield `unsupported`.

- [ ] **Step 4: Implement pure orchestration.** Keep dependencies injected in tests. Apply the root/frame rules above before PDF fallback, consume `inaccessibleCandidateFrameCount` when determining completeness, and aggregate only after choosing one representation. Represent ambiguous PDF discovery as an `unsupported` PDF candidate without fetching, then apply the same complete/partial/status precedence so a valid partial DOM result is not discarded. Map `AggregationOverflowError` to a non-downloadable `unsupported` result with a generic `INVALID_QTY` warning; never emit imprecise counts. Preserve selected adapter warnings, convert other unexpected failures to a generic `INACCESSIBLE_SOURCE`, and never retain raw documents, bytes, text, rows, or errors after returning.

- [ ] **Step 5: Implement and test runtime message guards.** `isScanRequest(value: unknown)` and `isScanResponse(value: unknown)` must reject malformed objects. The content listener handles only `SCAN_REQUEST`, returns `true` to keep the `sendResponse` channel open while the scan promise settles, sends exactly one `SCAN_RESULT`, and turns unexpected exceptions into an inaccessible `ScanResult` without stack traces or raw source text.

- [ ] **Step 6: Configure the local PDF API and worker in `src/content/index.ts`.** Import `getDocument` and `GlobalWorkerOptions` from `pdfjs-dist/legacy/build/pdf.mjs`, set `GlobalWorkerOptions.workerSrc` to `chrome.runtime.getURL('vendor/pdf.worker.min.mjs')` before PDF use, and inject `getDocument` through a thin `readPdfTextDocument` wrapper in `ScanDependencies`. Register no long-lived storage, network, page mutation, or unrelated listener.

- [ ] **Step 7: Verify and commit.**

  ```powershell
  npm.cmd test -- src/core/url.test.ts src/content/documents.test.ts src/content/pipeline.test.ts src/shared/messages.test.ts
  npm.cmd test
  npm.cmd run typecheck
  git diff --check
  git add src/core/url.ts src/core/url.test.ts src/content/documents.ts src/content/documents.test.ts src/content/pipeline.ts src/content/pipeline.test.ts src/shared/messages.ts src/shared/messages.test.ts src/content/index.ts
  git commit -S -m "feat: compose the AWB scan pipeline"
  git verify-commit HEAD
  ```

## Task 8: Implement accessible scan, warning, acknowledgement, and download UI

**Files:**

- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/ui.test.ts`
- Create: `src/popup/ui.ts`
- Create: `src/popup/controller.test.ts`
- Create: `src/popup/controller.ts`
- Create: `src/popup/index.ts`

**Interfaces:**

- Consumes: active-tab URL, `ScanResponse`, acknowledgement state, aggregation/CSV helpers, and `chrome.downloads`.
- Produces:

  ```ts
  export interface PopupViewModel {
    statusText: string;
    summaryLines: string[];
    warningLines: string[];
    showAcknowledgement: boolean;
    canDownload: boolean;
    downloadLabel: 'Download CSV' | 'Download partial result';
  }

  export function derivePopupViewModel(
    result: ScanResult | null,
    partialAcknowledged: boolean
  ): PopupViewModel;

  export function renderPopup(model: PopupViewModel, root: Document): void;

  export interface PopupPorts {
    getActiveTab(): Promise<{ id: number; url?: string } | null>;
    requestScan(tabId: number): Promise<ScanResponse>;
    download(options: chrome.downloads.DownloadOptions): Promise<number>;
    createObjectUrl(blob: Blob): string;
    revokeObjectUrl(url: string): void;
    now(): Date;
  }

  export function createPopupController(root: Document, ports: PopupPorts): {
    scan(): Promise<void>;
    acknowledgePartial(acknowledged: boolean): void;
    download(): Promise<void>;
  };
  ```

- [ ] **Step 1: Create an accessible static popup shell.** Include one scan button, an `aria-live="polite"` status region, summary list, warnings heading/list, an unchecked partial acknowledgement checkbox, and a disabled download button. Load only the local `popup.js`; use no inline script, remote asset, or form submission.

- [ ] **Step 2: Write failing pure view tests in jsdom.** Assert complete results show the four approved numeric summary metrics—labels/pages inspected, product rows, unique SKUs, and total quantity—and enable `Download CSV`; partial results display every generic warning and keep download disabled until acknowledgement; empty/inaccessible/unsupported results never enable download. Assert exact actionable status guidance: open an AWB route for unsupported, wait/retry or report viewer access for inaccessible, verify the print document for empty, and review/acknowledge every warning for partial. Spy on or inspect DOM writes to ensure raw strings are assigned through `textContent`/created text nodes, not `innerHTML`.

- [ ] **Step 3: Implement view derivation and rendering.** Keep warning text generic and include a one-based label number only when present. Reset acknowledgement and prior result on every scan. Disable controls while scanning. Retain the selected `ScanResult` only in popup memory.

- [ ] **Step 4: Write failing controller tests with injected ports.** Cover unsupported/missing active tabs, malformed/no content response, loading-state control disabling, a second scan resetting the previous result and acknowledgement, complete and partial state transitions, and generic API errors. Assert no scan message is sent for an unsupported URL.

- [ ] **Step 5: Implement the injected controller and thin browser entry point.** Query the active tab, check its URL with `isSupportedAwbUrl`, send `SCAN_REQUEST`, validate `SCAN_RESULT`, and render an actionable error if no content script responds. Reset acknowledgement and any prior result at the start of every scan. `src/popup/index.ts` creates Chrome/URL ports and delegates all state transitions to the tested controller. Do not request the broad `tabs` permission; rely on the existing matching host permission.

- [ ] **Step 6: Write the failing download-boundary tests, then implement guarded explicit download.** Assert no API call for complete-without-result, partial-without-acknowledgement, or non-downloadable status. For an allowed result, assert exact Blob bytes/type, deterministic filename, `saveAs: true`, one download call, and URL revocation after the API settles on both resolve and reject. Recheck authorization inside `download()`, aggregate rows, serialize CSV bytes, create a Blob URL, call the injected download port, and revoke the URL in `finally`. On failure, render a generic actionable message without logging row data. Because official API documentation guarantees only that the download has started when the promise resolves, manual Chrome/Edge verification must prove the Blob remains readable through completion with this revocation timing; if either browser fails, stop for an approved design adjustment rather than adding persistence or switching schemes silently.

- [ ] **Step 7: Verify and commit.**

  ```powershell
  npm.cmd test -- src/popup/ui.test.ts src/popup/controller.test.ts
  npm.cmd test
  npm.cmd run typecheck
  git diff --check
  git add src/popup/popup.html src/popup/popup.css src/popup/ui.ts src/popup/ui.test.ts src/popup/controller.ts src/popup/controller.test.ts src/popup/index.ts
  git commit -S -m "feat: add guarded CSV export popup"
  git verify-commit HEAD
  ```

## Task 9: Package the MV3 extension and document operation

**Files:**

- Create: `src/manifest.json`
- Create: `scripts/build.ts`
- Create: `tests/manifest-source.test.ts`
- Create: `tests/manifest-build.test.ts`
- Create: `README.md`
- Create: `THIRD_PARTY_NOTICES.md`

**Interfaces:**

- Consumes: content/popup entry points, static popup assets, the installed PDF.js worker, and the approved browser/privacy constraints.
- Produces: a reproducible ignored `dist/` directory loadable unpacked in Chrome and Edge, plus policy tests and user documentation.

- [ ] **Step 1: Write a failing source-manifest policy test in `tests/manifest-source.test.ts`.** Require:

  ```json
  {
    "manifest_version": 3,
    "version": "0.1.0",
    "minimum_chrome_version": "125",
    "permissions": ["downloads"],
    "host_permissions": ["https://seller.shopee.co.id/*"],
    "action": { "default_popup": "popup/popup.html" },
    "content_scripts": [
      {
        "matches": ["https://seller.shopee.co.id/awbprint*"],
        "js": ["content.js"],
        "run_at": "document_idle"
      }
    ],
    "web_accessible_resources": [
      {
        "resources": ["vendor/pdf.worker.min.mjs"],
        "matches": ["https://seller.shopee.co.id/*"]
      }
    ]
  }
  ```

  The actual manifest also needs `name` and `description`. Assert the permission/host/match arrays exactly, no `<all_urls>`, no background/service worker, no `content_security_policy` override, and no remotely hosted code. The Chrome 125 floor follows PDF.js's documented legacy-build support baseline; record the actual Chrome and Edge versions used in verification.

- [ ] **Step 2: Implement deterministic build assembly.** Use esbuild with `platform: 'browser'`, `format: 'iife'`, and `target: 'chrome125'` to bundle `src/content/index.ts` to `dist/content.js` and `src/popup/index.ts` to `dist/popup/popup.js`. Empty only the generated `dist/` directory, copy popup HTML/CSS and manifest, copy `node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs` to `dist/vendor/pdf.worker.min.mjs`, and copy `node_modules/pdfjs-dist/LICENSE` to `dist/vendor/pdfjs-LICENSE`. The legacy PDF.js API bundle and worker must come from the same locked package version. Fail when an entry, copied asset, worker, or license is absent.

- [ ] **Step 3: Write and run the separate post-build test.** `tests/manifest-build.test.ts` runs only through `vitest.dist.config.ts`. After a fresh build, assert every referenced file exists, built manifest policy equals source policy, JavaScript contains no `http://` or `https://` executable dependency reference, the worker is packaged locally, the PDF.js license is present, and no `.node` native binary exists anywhere in `dist/`. Do not assert against generated bundle hashes or commit `dist/`.

- [ ] **Step 4: Write user and third-party documentation.** In `README.md`, document prerequisites (including Chrome 125+ and a current Chromium Edge), the script-blocked dependency install and explicit esbuild preparation, verification/build commands, unpacked installation in Chrome and Edge, the supported URL, scan/acknowledge/download flow, exact CSV shape, permission rationale, on-device/no-storage privacy boundary, safe local fixture command, and limitations when Shopee changes layout or exposes an inaccessible browser PDF viewer. Explain that CSV bytes preserve every approved SKU character exactly, but spreadsheet applications may auto-convert digit-only values or evaluate formula-leading values when a file is opened directly; instruct users to open only exports whose underlying seller data is trusted and import the SKU column as text. State that formula hardening would alter the exact SKU contract and is not enabled. Include the official links already recorded in the approved design and no real label sample. In `THIRD_PARTY_NOTICES.md`, record the exact locked PDF.js version, Apache-2.0 license, upstream project URL, bundled API/worker purpose, and location of the packaged license copy.

- [ ] **Step 5: Verify and commit source/package documentation.**

  ```powershell
  npm.cmd test -- tests/manifest-source.test.ts
  npm.cmd run build
  npm.cmd run test:dist
  npm.cmd run format:check
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd test
  npm.cmd audit signatures
  npm.cmd audit --audit-level=high
  git diff --check
  git status --short --branch
  git add src/manifest.json scripts/build.ts tests/manifest-source.test.ts tests/manifest-build.test.ts README.md THIRD_PARTY_NOTICES.md
  git commit -S -m "build: package the MV3 extension"
  git verify-commit HEAD
  ```

## Task 10: Verify privacy, browsers, behavior, and signed history

**Files:**

- Create: `docs/superpowers/verification/2026-08-03-shopee-awb-sku-exporter.md`
- Modify production/test files only when a failing verification proves a defect; use a new red-green cycle and a separate signed commit for each fix.

**Interfaces:**

- Consumes: built `dist/`, synthetic test suite, ignored local fixture, Chrome, Edge, an authenticated or safely captured AWB representation, and Git history.
- Produces: a concise verification record containing commands, versions, pass/fail results, limitations, and no customer/shipment data.

- [ ] **Step 1: Run the complete automated suite from a clean build.**

  ```powershell
  npm.cmd run format:check
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd test
  npm.cmd run build
  npm.cmd run test:dist
  npm.cmd run verify:fixture -- "D:\Downloads\RESI.pdf"
  git diff --check
  git ls-files "*.pdf"
  git status --short --branch
  ```

  Require every command to succeed, require the PDF listing to be empty, and verify fixture output contains only the seven allowed count/status fields.

- [ ] **Step 2: Review the built privacy/security boundary.** Inspect `dist/manifest.json`, packaged files, and DevTools Network activity. Confirm only the approved Shopee host permission and `downloads` permission, no external code/service request, no storage write, no raw-source console output, and no permission prompt beyond the manifest.

- [ ] **Step 3: Verify Chrome manually.** Load `dist/` unpacked, test an unsupported tab, the supported AWB route, complete scan summary, explicit CSV download, partial acknowledgement gate, no-row/changed-layout outcomes, and inaccessible-viewer behavior. Open the CSV as bytes/text and confirm BOM, exact `SKU,Jumlah` header, CRLF, escaping, leading-zero/punctuation preservation, first-seen ordering, and duplicate summation.

- [ ] **Step 4: Repeat the same unpacked-extension checks in Microsoft Edge.** Record browser versions and any browser-PDF-viewer limitation. Do not broaden permissions as a workaround; stop and request approval if a browser requires an architectural or permission change.

- [ ] **Step 5: Record evidence without sensitive content.** In the verification document, list exact commands and exit outcomes, Chrome/Edge versions, which scenarios were exercised, and any unavailable live-authenticated scenario. Record counts/status only for the real fixture. If authenticated AWB access is unavailable, mark that check unverified and do not claim full live-page completion.

- [ ] **Step 6: Verify every implementation commit signature.** From an implementation worktree branched from approved root `main`, run:

  ```powershell
  $implementationBase = git merge-base main HEAD
  git rev-list --reverse "$implementationBase..HEAD" | ForEach-Object {
    git verify-commit $_
    if ($LASTEXITCODE -ne 0) { throw "Unsigned or invalid commit: $_" }
  }
  ```

- [ ] **Step 7: Commit the verification record and rerun final checks.**

  ```powershell
  git add docs/superpowers/verification/2026-08-03-shopee-awb-sku-exporter.md
  git commit -S -m "docs: record extension verification"
  git verify-commit HEAD
  npm.cmd run verify
  git diff --check
  git status --short --branch
  ```

  Do not push or configure a remote. Hand off with exact verified/unverified items and use `superpowers:finishing-a-development-branch` only after all required checks are complete.

## Completion Criteria

- Every approved design requirement maps to a task and an actual verification check.
- Core tests prove string-preserving normalization, positive safe-integer Qty parsing, first-seen aggregation, exact CSV header, UTF-8 BOM, CRLF, escaping, and filename shape.
- Synthetic DOM and PDF tests cover complete, partial, empty, inaccessible, and unsupported outcomes without customer data.
- The adapter pipeline selects exactly one representation and never silently invents or combines rows.
- Partial download requires explicit acknowledgement; all non-downloadable statuses remain blocked.
- The built extension uses only local code, the approved Shopee host permission, and `downloads`.
- The ignored 50-page fixture is verified through count/status-only output and remains untracked.
- Chrome and Edge behavior is recorded; unavailable authenticated/live-page checks are disclosed rather than claimed.
- Every new commit is GPG-signed and verified; no remote is configured and nothing is pushed.
