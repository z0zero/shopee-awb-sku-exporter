# Task 7 verification: local AWB PDF scanning and warning accuracy

**Verification run:** 2026-08-05
**Worktree:** `feature/shopee-awb-sku-exporter-v1`

## Automated evidence

The focused TDD test was first run before the implementation and exited `1`
with the expected missing-export failure (`buildFixtureSummary is not a
function`). After the implementation, the same command exited `0`:

```text
npm.cmd test -- tests/verify-resi.test.ts
1 test file, 3 tests passed
```

The later parser regressions were also run after the private-fixture
comparison:

```text
npm.cmd test -- src/adapters/pdf-text.test.ts
1 test file, 18 tests passed
```

The required checks produced these results:

| Command                                                                                       | Exit | Evidence                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run verify`                                                                          |    1 | Stopped at `prettier --check`; six pre-existing out-of-scope files were reported: `src/adapters/pdf-document.ts`, `src/content/pipeline.test.ts`, `src/content/pipeline.ts`, `src/popup/controller.ts`, `src/ui/scan-result.test.ts`, and `tests/manifest-build.test.ts`. |
| `npm.cmd exec -- prettier --check scripts/verify-resi.ts tests/verify-resi.test.ts README.md` |    0 | All changed checked files formatted.                                                                                                                                                                                                                                      |
| `npm.cmd run typecheck`                                                                       |    0 | TypeScript check passed.                                                                                                                                                                                                                                                  |
| `npm.cmd run lint`                                                                            |    0 | ESLint passed.                                                                                                                                                                                                                                                            |
| `npm.cmd test`                                                                                |    0 | 24 test files, 160 tests passed.                                                                                                                                                                                                                                          |
| `npm.cmd run build`                                                                           |    0 | Production package built.                                                                                                                                                                                                                                                 |
| `npm.cmd run test:dist`                                                                       |    0 | 1 dist test file, 2 tests passed after retrying an initial sandbox `EPERM` while Vite wrote `.vite-temp`.                                                                                                                                                                 |
| `npm.cmd audit --omit=dev --audit-level=high`                                                 |    0 | `found 0 vulnerabilities`. The initial sandbox attempt could not reach the advisory endpoint; the approved retry succeeded.                                                                                                                                               |
| `npm.cmd audit signatures`                                                                    |    0 | `audited 248 packages in 11s`; 248 packages had verified registry signatures and 119 packages had verified attestations. The initial sandbox attempt failed with `EACCES` while connecting to the Sigstore root endpoint; the approved retry succeeded.                   |
| `npm.cmd audit --audit-level=high`                                                            |    0 | `found 0 vulnerabilities`. The initial sandbox attempt could not reach the advisory endpoint; the approved retry succeeded.                                                                                                                                               |
| `git diff --check`                                                                            |    0 | No whitespace errors.                                                                                                                                                                                                                                                     |
| `git ls-files "*.pdf"`                                                                        |    0 | No tracked PDF files.                                                                                                                                                                                                                                                     |

The repository declares `npm@11.4.1` in `package.json`. The command meanings
used above were checked against the [official npm v11 audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/):
`audit signatures` verifies registry signatures and provenance attestations,
and `--audit-level=high` sets the vulnerability threshold for a non-zero exit.

A final rerun of the three audit commands was blocked by the current sandbox's
registry-network policy. The passing audit evidence above is from the prior
verification on the unchanged dependency graph; no dependency files changed
during the parser work.

## Private fixture evidence

The count-only harness ran successfully against the approved local path
`D:\Downloads\RESI.pdf` and emitted only these aggregate fields:

```text
pageCount=50
labelsInspected=50
rowsDetected=58
uniqueSkus=42
totalQuantity=59
warningCount=0
warningCodeCounts={}
status=complete
```

These aggregate row counts and quantities match the user's page-by-page
reference for the 50 local AWBs, and the continuation fixes remove the
previous false warning set. No per-page identifiers or pasted SKU list were
written to this record.

The automated warning-code test continues to use synthetic rows and warnings
only. It proves the sorted count and aggregate-only serialization contract;
the private fixture itself now emits no warnings.

## Package and permission evidence

Source manifest permissions were exactly:

```text
permissions=["downloads"]
host_permissions=["https://seller.shopee.co.id/*"]
```

The successful build contained these 10 assets:

```text
content.js
local-pdf/local-pdf.css
local-pdf/local-pdf.html
local-pdf/local-pdf.js
manifest.json
popup/popup.css
popup/popup.html
popup/popup.js
vendor/pdf.worker.min.mjs
vendor/pdfjs-LICENSE
```

No PDF file was tracked, and no new permission or file-URL host permission was
added by Task 7.

## Manual browser checks

Chrome and Edge manual checks are **unverified**. The available browser-control
session exposed only one `about:blank` Chrome DevTools page; it had no
authenticated Shopee session, no connected Edge session, and no capability in
this run to load the unpacked extension and exercise its file chooser,
download, permission, or DevTools network checks. Static source/build evidence
does not replace those browser checks.
