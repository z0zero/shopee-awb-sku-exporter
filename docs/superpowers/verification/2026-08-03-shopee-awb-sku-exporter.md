# Shopee AWB SKU Exporter verification

Date: 2026-08-04

## Scope and privacy boundary

Verification was run from the implementation worktree on branch
`feature/shopee-awb-sku-exporter-v1`. The real `D:\Downloads\RESI.pdf` file was
used only through the count-only harness. No raw PDF text, customer name,
address, phone number, order number, tracking number, SKU value, or shipment
identifier is recorded here.

The generated `dist/` directory is ignored and was inspected locally; it is not
part of the committed source or verification record.

## Automated verification

All commands below exited successfully:

```text
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
17 test files passed; 94 tests passed.

npm.cmd run build
npm.cmd run test:dist
1 dist test file passed; 2 tests passed.

npm.cmd audit signatures
189 packages audited; 189 registry signatures and 71 attestations verified.

npm.cmd audit --audit-level=high
0 vulnerabilities found.

git diff --check
passed.
```

The source-policy test passed with 1 test. The focused popup suite passed with
2 files and 10 tests as part of the full suite. The final build contains the
content bundle, popup bundle/HTML/CSS, local PDF.js worker, local PDF.js
license, and manifest.

## Count-only private fixture result

Command:

```powershell
npm.cmd run verify:fixture -- "D:\Downloads\RESI.pdf"
```

The harness emitted exactly the approved seven keys and exited `0`:

```json
{
  "pageCount": 50,
  "labelsInspected": 50,
  "rowsDetected": 42,
  "uniqueSkus": 33,
  "totalQuantity": 43,
  "warningCount": 316,
  "status": "partial"
}
```

`git ls-files "*.pdf"` returned no files.

## Built permission and privacy review

Static inspection of `dist/manifest.json` confirmed:

- permission: `downloads` only;
- host permission: `https://seller.shopee.co.id/*` only;
- content-script match: `https://seller.shopee.co.id/awbprint*` only;
- local popup, content bundle, PDF worker, and license assets;
- no background worker, `<all_urls>`, CSP override, or remote script entry.

Static source/bundle checks found:

- 0 source console calls;
- 0 source storage calls (`chrome.storage`, `localStorage`, or
  `sessionStorage`);
- 0 direct remote executable URL patterns;
- 0 native `.node` binaries in `dist/`;
- PDF.js license size: 10,174 bytes;
- local PDF.js worker size: 1,312,452 bytes.

DevTools Network inspection and browser permission-prompt inspection were not
available because the connected browser automation session had no tabs and the
Chrome/Edge native host registry entry was missing. Static checks are not a
substitute for those live observations.

## Browser environment and manual scenarios

Installed executable versions:

- Google Chrome: `150.0.7871.188`
- Microsoft Edge: `151.0.4129.59`

The Chrome control connection was unavailable. Diagnostics reported the ChatGPT
extension absent from the selected Chrome profile and the shared native-host
registry entry missing. Edge likewise had no installed test extension in its
selected profile. No browser window was launched, no extension was installed,
and no native host or browser configuration was modified.

Consequently, these scenarios remain **unverified**:

- loading `dist/` unpacked in Chrome or Edge;
- unsupported-tab URL gate in a real popup;
- authenticated AWB scan and real content-script messaging;
- complete/partial/empty/inaccessible live outcomes;
- explicit CSV download, Blob revocation through completion, and downloaded
  byte inspection in either browser;
- live DevTools network activity and browser permission prompts;
- browser PDF-viewer behavior and any authenticated layout representation.

The synthetic tests cover the corresponding controller/UI/download contracts,
and the private fixture confirms only the count/status shape above. These
checks do not justify a claim of full live-page completion.

## Signed history

The implementation base is:

```text
merge-base(main, HEAD) = 2352677dc7ee9648fa7701d65ffacbe26df6ddfa
```

The planned verification loop checked every commit in the reverse-order range
from that base through implementation `HEAD` `609c0590c8cdb8885dc980c2d71ab0c2bd6dbdd0`.
All 15 implementation commits passed `git verify-commit` with a good signature
from the configured `z0zero` GitHub key. The signed commit that adds this
verification record was verified separately immediately after creation.

No remote was configured or pushed during verification.

## Official references

- [Chrome Manifest V3 reference](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [Chrome MV3 remote-code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Microsoft Edge Chromium extension compatibility](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension)
- [PDF.js API](https://mozilla.github.io/pdf.js/api/)

## Final disposition

Automated verification, privacy-safe fixture verification, package policy, and
signed-history checks passed. Live browser behavior remains explicitly
unverified because the local browser automation/native-host prerequisites were
unavailable.
