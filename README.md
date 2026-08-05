# Shopee AWB SKU Exporter

Shopee Seller Center AWB print documents can contain several product rows and
duplicate SKUs. This Manifest V3 extension reads a supported AWB route locally,
aggregates positive quantities by SKU in first-seen order, and downloads an
explicit UTF-8 CSV export.

## Requirements

- Node.js 22.13+ (or Node.js 24+)
- npm 11.4.1, as declared by `packageManager`
- Chrome 125+ or a current Chromium-based Microsoft Edge for unpacked use
- An authenticated Shopee Seller Center session with an AWB print route

The supported page shape is:

```text
https://seller.shopee.co.id/awbprint?...
```

The extension does not support arbitrary Shopee pages or other marketplaces.

## Install dependencies and build

This repository's `.npmrc` keeps dependency lifecycle scripts disabled by
default. Install dependencies, then explicitly prepare the local esbuild
binary before building:

```powershell
npm.cmd install
npm.cmd run deps:prepare
npm.cmd run build
```

The build creates an ignored `dist/` directory containing the unpacked
extension. It bundles the content and popup entry points, copies the static
popup files and manifest, and packages the locked PDF.js worker and license.
The builder verifies that the installed PDF.js version is `6.2.108` before
assembling the output.

## Download a GitHub build

The `Build extension` GitHub Actions workflow runs for pushes and pull requests
targeting `main`, and can also be started manually. It checks that the package
and manifest versions match (`0.1.0` for this release), builds and tests the
extension, then uploads the exact `shopee-awb-sku-exporter.zip` package as a
workflow artifact. Open a completed workflow run on GitHub and download its
artifact; the downloaded artifact contains the extension ZIP with the manifest
version included.

After a successful push to `main`, or a manual run selected on `main`, a
separate job updates the initialized `Release` branch so it contains the same
`shopee-awb-sku-exporter.zip` package. Pull-request runs remain build-only and
cannot publish. The publisher uses job-scoped `contents: write` permission and
GitHub's `createCommitOnBranch` mutation, which automatically signs the
versioned publish commit and marks it as verified.

## Load the unpacked extension

Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked** and choose this repository's `dist/` directory.

Microsoft Edge:

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked** and choose this repository's `dist/` directory.

Keep the extension enabled and open the supported AWB route in the active tab.
Reload the extension after rebuilding.

## Scan and export

For the authenticated Shopee workflow:

1. Open an AWB print route matching the supported URL while signed in to
   Shopee Seller Center.
2. Open the extension popup and select **Scan current AWB**.
3. Review labels/pages inspected, product rows, unique SKUs, total quantity,
   and every warning.

For a downloaded PDF:

1. Open the extension popup and select **Choose downloaded PDF**. This opens a
   persistent extension page so file selection and parsing are not interrupted
   by the popup closing.
2. Choose one PDF. A second selection replaces the first result; files are
   never combined into one scan.
3. The selected file must be no larger than 50 MiB and contain no more than
   500 pages. Processing is local and in memory.
4. The PDF must contain a readable text layer. Image-only PDFs are unsupported
   because this extension does not perform OCR.

For either workflow, a complete result enables **Download CSV**. A partial
result remains blocked until every warning is explicitly acknowledged; then
**Download partial result** becomes available. Empty, inaccessible,
unsupported, or changed-layout results do not create a downloadable CSV.

The extension keeps the selected result in the popup or persistent local-PDF
page memory only. It does not send label data to a server, store it in
extension storage, log it, or add analytics/telemetry.

## CSV contract

The export begins with a UTF-8 BOM and uses the exact header `SKU,Jumlah`.
Rows use CRLF endings, preserve approved SKU characters including leading
zeroes and meaningful punctuation, and follow first-seen SKU order after
duplicate quantities are summed. Cells containing commas, quotes, or line
breaks use standard CSV escaping.

Spreadsheet programs may automatically convert digit-only SKUs to numbers or
evaluate values beginning with formula characters when a CSV is opened
directly. Import the SKU column as text and open only exports whose underlying
seller data is trusted. Formula hardening is intentionally not enabled because
it would change the exact SKU contract.

## Permissions and privacy

- `downloads`: required only for the user-requested CSV download.
- `https://seller.shopee.co.id/*`: required to inspect the Seller Center source
  and expose the local PDF worker on that origin.
- The content script matches only
  `https://seller.shopee.co.id/awbprint*`.

There is no `<all_urls>` access, background service worker, storage, account
authentication, remote parser, analytics, telemetry, or external code. PDF.js
and its worker are packaged locally. The extension does not request file-URL
access, add a new permission, make network requests for local-PDF processing,
use browser storage, or access tabs across browsers or browser profiles.
Cross-origin or inaccessible sources are reported instead of being fetched
through a workaround.

## Verification commands

Run the focused policy test, build, post-build package test, and repository
checks with:

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
```

The count-only local fixture harness can be run explicitly when the private
fixture is available. It prints only the approved aggregate/status fields and
does not write an expected-output file:

```powershell
npm.cmd run verify:fixture -- "D:\Downloads\RESI.pdf"
```

Do not commit the fixture or any output containing label, customer, order, or
shipment data. `dist/` is generated and ignored.

## Limitations

Shopee may change its DOM, accessibility text, label layout, or PDF viewer
behavior. The extension reports an actionable partial, empty, unsupported, or
inaccessible result when the source cannot be read reliably; it does not invent
SKU or quantity values. Browser PDF viewers may also restrict access to a
document that is not exposed as a same-origin PDF source.

The implementation uses the local PDF.js display API as a fallback for a
reachable text-layer PDF. It does not use OCR, cloud services, or remote PDF
inspection. The local PDF page accepts one user-selected file at a time and
keeps the selected bytes and extracted result in memory only.

## Official references

- [Chrome Manifest V3 reference](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Chrome action popups](https://developer.chrome.com/docs/extensions/develop/ui/add-popup)
- [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Chrome permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Chrome content scripts and isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [Chrome MV3 remote-code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [W3C File API](https://www.w3.org/TR/FileAPI/)
- [Microsoft Edge Chromium extension compatibility](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension)
- [PDF.js browser examples](https://mozilla.github.io/pdf.js/examples/index.html)
- [PDF.js API reference](https://mozilla.github.io/pdf.js/api/)
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub Actions workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)
- [actions/setup-node](https://github.com/actions/setup-node)
- [actions/upload-artifact](https://github.com/actions/upload-artifact)
- [GitHub `createCommitOnBranch`](https://docs.github.com/en/graphql/reference/mutations#createcommitonbranch)
