# Shopee AWB Local PDF and Warning Accuracy Design

**Date:** 2026-08-04
**Status:** Approved 2026-08-04; implementation plan approved 2026-08-05
**Scope:** Correct false PDF row warnings and add user-selected local PDF scanning to the existing Chrome and Microsoft Edge Manifest V3 extension

## Relationship to the v1 design

This specification extends `2026-08-03-shopee-awb-sku-exporter-design.md`. Requirements from that design remain authoritative unless this document changes them explicitly.

This document changes two areas:

1. The PDF text adapter must distinguish real product rows from wrapped product-name lines and post-table footer content.
2. Users may scan one downloaded PDF at a time through a packaged extension page opened from the popup.

The existing authenticated Shopee `/awbprint` scan remains supported. This change does not add automatic access to an active `file://` tab.

## Evidence and problem statement

The authenticated Shopee scan now reaches the printable PDF and extracts the expected SKU row. A user-provided CSV from the retest contains the expected two columns, one row, and total quantity one.

The same scan reports false warnings. Privacy-safe structural diagnostics of the first label found one valid product row followed by three visual groups. Two groups are wrapped product-name text, and the last group is footer content. The current parser treats all three as row candidates because their rendered boxes overlap the broad SKU or Qty bands. That produces exactly two false `MISSING_SKU` warnings, three false `INVALID_QTY` warnings, and a `PARTIAL_EXTRACTION` warning.

The root causes are:

- row candidacy uses geometric intersection rather than the origin of a table cell;
- the parser has no explicit lower product-table boundary; and
- wrapped continuation handling does not support a chain of multiple product-name lines.

The downloaded PDF workflow is also needed because the user operates three Shopee stores across separate Chrome and Edge browser contexts. A downloaded PDF from any store should be processable in one preferred browser without granting the extension general local-file URL access.

## Goals

- A structurally valid label with one product row, wrapped product-name text, and a Shopee footer produces one row and no warnings.
- Genuinely missing, ambiguous, or malformed SKU and Qty cells continue to produce visible warnings.
- The popup offers separate actions for scanning the active Shopee AWB page and choosing a downloaded PDF.
- One user-selected PDF is processed per local scan.
- Local PDF processing uses the existing bundled PDF.js `6.2.108`, normalized row contract, aggregation rules, warnings, and CSV behavior.
- Local files and extracted data remain on-device and in memory only.
- Local PDF scanning requires no `file://` host permission and no new browser permission.
- Chrome and Microsoft Edge use the same extension package and workflow.

## Non-goals

- Automatically reading the currently open `file://` PDF tab.
- Adding `file:///*`, `<all_urls>`, or unrelated host permissions.
- Batch-selecting or combining multiple PDFs in one CSV.
- Sharing active tabs, extension state, or authenticated sessions across browsers or profiles.
- Persisting recent files, extracted rows, scan history, or store identity.
- OCR, image-only PDF support, cloud parsing, analytics, telemetry, authentication, or backend services.
- Supporting marketplaces or Shopee regions beyond the existing approved scope.

## Approaches considered

### Persistent extension page opened from the popup — selected

The popup keeps the active-page scan and adds a `Choose downloaded PDF` action. That action opens a packaged extension page. The page owns file selection, parsing, warning review, and download.

This is selected because Chrome action popups automatically close when focus moves outside them and cannot be forced to stay open. A system file picker and a multi-page PDF scan therefore need a longer-lived page.

### Process the selected PDF inside the popup

This would add fewer files, but the popup lifecycle can interrupt file selection or parsing. It is rejected as unreliable for the observed 50-page fixture.

### Inject into or fetch from the active `file://` tab

This would resemble the active Shopee-page workflow, but it requires a file match pattern and a user-controlled `Allow access to file URLs` setting in every installation. It broadens local-file access and still couples behavior to the browser's PDF viewer. It is rejected for v1.

## Architecture

The popup becomes a small router with two explicit actions:

```text
extension popup
  |-- Scan current AWB
  |     -> existing Shopee content script
  |     -> DOM or reachable PDF adapter
  |     -> shared result builder
  |
  `-- Choose downloaded PDF
        -> packaged local-PDF extension page
        -> user selects one File
        -> local file validation
        -> PDF.js text document
        -> corrected PDF text adapter
        -> shared result builder
        -> review and CSV download
```

The local-PDF page is an extension-owned HTML document, not a content script and not a replacement PDF viewer. It uses ordinary user-selected File API access and calls the same pure PDF reading and extraction modules used by the Shopee fallback.

Result normalization and aggregation currently embedded in the content pipeline must move to a source-independent core boundary. Both the content pipeline and local-PDF controller call that boundary so status ranking, row filtering, warning normalization, aggregation overflow handling, and summary metrics cannot drift.

The build adds the local-PDF page assets and browser bundle to `dist`. The existing bundled PDF.js worker remains the only worker and is addressed through `chrome.runtime.getURL`. No new runtime dependency is required.

## Local PDF data flow

1. The user opens the extension popup and chooses `Choose downloaded PDF`.
2. The popup opens the packaged local-PDF page in a normal browser tab.
3. The page presents a single-file input restricted for discoverability to PDF files. The restriction is a usability hint, not a security boundary.
4. The user selects one file. A new selection clears the previous result and partial-warning acknowledgement.
5. The controller rejects an empty file or a file larger than 50 MiB before parsing.
6. The controller reads the selected file into an `ArrayBuffer`, converts it to bounded bytes, and validates the `%PDF-` signature. It does not trust only the filename, extension, or declared MIME type.
7. PDF.js reads at most 500 pages and extracts positioned text items. Password-protected, corrupted, image-only, or otherwise unreadable documents produce an actionable non-downloadable result.
8. The PDF text adapter returns normalized product rows and generic warnings.
9. The shared result builder validates rows, aggregates duplicate SKUs in first-seen order, and creates summary metrics.
10. The page renders the result with text-safe DOM operations. A complete result enables download. A partial result requires the existing explicit acknowledgement.
11. CSV creation and download reuse the existing `SKU,Jumlah`, UTF-8 BOM, CRLF, escaping, timestamped filename, and object-URL revocation behavior.
12. Selecting another file or closing the page releases the only extension references to the PDF bytes and extracted result.

## Corrected PDF table model

### Header and table region

Each page must contain one unambiguous visual header group with exactly one normalized `Nama Produk`, `Variasi`, `SKU`, and `Qty` anchor. Missing or duplicate required anchors preserve the existing unsupported or ambiguous behavior.

The product-table region starts immediately below that header. After at least one row candidate, the first visual group whose product-column item normalizes to the prefix `pesan:` ends the region. The footer group and all later groups are excluded from row classification. If no footer marker exists, the region continues to the end of the page.

The marker comparison is case-insensitive and whitespace-normalized. The parser does not retain or expose the value that follows the marker.

### Cell ownership

Column ownership is based on where an item's left edge or center originates, depending on the existing cell rule. A product-name item's rendered width crossing a midpoint does not make it a SKU or Qty cell.

Geometric intersection may still detect an unsupported item that deliberately spans both identity columns, but intersection alone cannot create a row candidate.

### Valid rows

Qty remains the primary row anchor. A valid row has:

- exactly one positive base-10 integer item wholly contained in the Qty band; and
- one unambiguous, zero-gap SKU value beginning in the SKU band on the same visual row.

The existing SKU preservation and Qty validation rules remain unchanged.

### Wrapped product names

A visual group is a wrapped product-name continuation only when:

- it contains one product-column-origin item;
- it has no SKU-origin, Qty-contained, or variation-column-origin item;
- it follows a valid or already accepted continuation group within the existing height-derived continuation tolerance; and
- it occurs before the next row candidate or footer marker.

This chained rule supports multi-line names. A distant unmatched product-column group is not silently accepted as continuation.

### Malformed rows and warnings

A group remains row-like when it contains a Qty cell origin, a SKU cell origin, or origins in two or more table columns inside the active table region. A row-like group that cannot satisfy the valid-row contract emits the smallest applicable generic warning:

- valid Qty but no SKU -> `MISSING_SKU`;
- SKU or multi-column row evidence but missing, malformed, zero, negative, decimal, or ambiguous Qty -> `INVALID_QTY`;
- ambiguous/discontinuous SKU -> `AMBIGUOUS_SKU`;
- structurally conflicting row layout -> `UNSUPPORTED_LAYOUT`.

Any skipped row keeps the result `partial` and includes one `PARTIAL_EXTRACTION` warning. Wrapped continuation lines and excluded footer content emit no warnings.

Warnings never contain raw PDF text, SKU values, filenames, filesystem paths, order numbers, tracking numbers, customer data, or addresses.

## UI behavior

### Popup

The popup keeps its current summary and download flow for active-page scans. Its primary controls are labeled distinctly:

- `Scan current AWB`
- `Choose downloaded PDF`

Choosing a downloaded PDF opens the persistent page; it does not attempt to inspect the active tab or ask for file-URL permission.

### Local-PDF page

The page displays:

- a heading that identifies local PDF scanning;
- one file chooser;
- an in-progress status while reading and parsing;
- the existing labels/pages, product rows, unique SKUs, and total quantity summary;
- generic warning lines with label/page indexes;
- the existing partial-result acknowledgement; and
- the existing complete or partial CSV download action.

Controls that could start another scan or download an incomplete result are disabled while processing. A second selection replaces, rather than combines with, the previous scan.

## Error behavior

- **No file selected:** remain ready; do not create a result.
- **Empty, non-PDF, or oversized file:** reject before PDF.js with a generic local-file validation message.
- **More than 500 pages:** return inaccessible and do not download.
- **Password-protected, corrupted, or unreadable PDF:** return inaccessible and do not expose parser details.
- **No usable text layer or missing product headers:** return unsupported and do not download.
- **Readable source with no product rows:** return empty and do not download.
- **Valid rows plus genuine malformed rows/pages:** return partial and require acknowledgement.
- **All recognized rows valid and no warnings:** return complete and enable normal CSV download.
- **Download failure:** keep the scan result available and show the existing retry message.

## Privacy and security boundaries

The selected `File` and its bytes are untrusted input crossing into an extension page. Controls are size and page limits, PDF signature validation, fail-closed parsing, generic errors, and safe text rendering.

The assets are the customer's shipment data and the integrity of exported SKU quantities. The extension must therefore:

- perform no network request in the local-PDF flow;
- request no new permission and no file-scheme host access;
- keep PDF bytes, positioned text, rows, and CSV bytes in memory only;
- use no `storage`, IndexedDB, cache, telemetry, analytics, clipboard, or remote service;
- avoid `innerHTML`, `eval`, remotely hosted code, and raw parser exceptions in the UI;
- preserve the existing extension Content Security Policy and locally bundled dependency model;
- never log or commit real fixture text or derived identifiers; and
- revoke generated object URLs after the browser accepts or rejects the download request.

The existing real `RESI.pdf` remains a local, ignored integration fixture. Automated tests use synthetic, redacted data only.

## Acceptance criteria

1. The observed one-label structure produces `complete`, one row, one unique SKU, total quantity one, and zero warnings.
2. Multi-line wrapped product names do not produce SKU or Qty warnings solely because their rendered widths cross column bands.
3. The `Pesan:` footer and later page content produce no product-row warnings.
4. Synthetic malformed rows before the footer continue to produce their appropriate warnings and a partial result.
5. The popup can still scan the active Shopee `/awbprint` document.
6. `Choose downloaded PDF` opens a persistent extension page and processes one selected PDF.
7. Selecting a second PDF replaces the first result and never aggregates across files.
8. The local flow works without `file:///*`, `<all_urls>`, storage, or any new manifest permission.
9. Local and active-page PDF scans use the same PDF adapter, result normalization, aggregation, warning, and CSV rules.
10. Complete results download normally; partial results require explicit acknowledgement; other statuses cannot download.
11. No real PDF text, SKU, filename, path, customer data, order identifier, or tracking identifier appears in logs, tests, committed files, or warning messages.
12. The unpacked production build works in both supported Chrome and Microsoft Edge versions.

## Testing and verification

### Automated tests

- Add a synthetic PDF text fixture containing one valid row, two chained wrapped product-name lines whose widths cross identity bands, a normalized `Pesan:` footer, and later synthetic footer items. Expect one row, complete status, and no warnings.
- Retain and adapt malformed-row fixtures so missing SKU, ambiguous SKU, invalid Qty, spanning identity cells, and close multi-column malformed rows remain visible.
- Test footer matching for casing and repeated whitespace without embedding any real identifiers.
- Test a distant product-only group is not accepted as a wrapped continuation.
- Test local-file boundary validation for empty bytes, over-limit size, incorrect signature, PDF.js read failure, over-limit page count, and successful processing.
- Test shared result building from both content and local controllers, including aggregation overflow.
- Test local-page state transitions: ready, processing, complete, partial, empty, inaccessible, unsupported, replacement selection, acknowledgement, and download failure.
- Test popup routing and the presence of both explicit actions.
- Test production-build packaging for the local page bundle, HTML, CSS, PDF.js worker, manifest, and license.
- Test that the source and built manifests do not add file-URL, all-host, storage, or unrelated permissions.

### Privacy-safe local integration

The local harness may read `D:\Downloads\RESI.pdf` and report only aggregate counts, status, and warning-code counts. It must not print filenames from the selected-file UI, extracted strings, SKU values, customer data, order identifiers, tracking identifiers, addresses, or per-label source text.

The harness verifies that warning counts fall for structural reasons while row counts and aggregates remain explainable. Any remaining warning must be mapped to a genuine malformed or unsupported synthetic-equivalent structure before completion is claimed.

### Manual browser verification

- Load the unpacked `dist` directory in current supported Chrome and Microsoft Edge.
- Verify the existing authenticated Shopee AWB route still scans and exports correctly.
- Open `Choose downloaded PDF`, select the local fixture, and verify the stable page remains available throughout processing.
- Confirm the observed single-label case reports one row, quantity one, and no warnings.
- Confirm a partial synthetic/manual fixture cannot download until acknowledged.
- Select a second PDF and verify it replaces the prior result.
- Inspect extension permissions and confirm no file-URL or new permission appears.
- Confirm no network request occurs during local-file processing using browser DevTools.

### Required commands

- `npm.cmd run verify`
- `npm.cmd run verify:fixture -- "D:\Downloads\RESI.pdf"`
- `npm.cmd audit --omit=dev --audit-level=high`
- `git diff --check`
- `git verify-commit HEAD` for every new commit

Manual Chrome and Edge checks remain required because automated unit and build tests cannot prove browser popup, file-picker, extension-page, or download behavior.

## Sources

- Chrome extension popups and automatic close behavior: https://developer.chrome.com/docs/extensions/develop/ui/add-popup
- Chrome permission declarations and user-controlled file-URL access: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome match patterns and the `file` scheme: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- Chrome Manifest V3 manifest reference: https://developer.chrome.com/docs/extensions/reference/manifest
- Chrome extension-page Content Security Policy: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- Microsoft Edge compatibility with Chrome extension APIs and manifests: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/port-chrome-extension
- W3C File API, user-selected files, and local reads: https://www.w3.org/TR/FileAPI/
- PDF.js examples and `getDocument`: https://mozilla.github.io/pdf.js/examples/index.html
- PDF.js API reference: https://mozilla.github.io/pdf.js/api/
