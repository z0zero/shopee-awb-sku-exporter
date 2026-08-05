# Task 5 Report: PDF.js-independent positioned PDF text extraction

## Files

- Created `tests/fixtures/pdf-text.ts`
- Created `src/adapters/pdf-text.test.ts`
- Created `src/adapters/pdf-text.ts`

## RED evidence

Command:

```powershell
npm.cmd test -- src/adapters/pdf-text.test.ts
```

Observed failure before implementation:

```text
FAIL src/adapters/pdf-text.test.ts
Error: Cannot find module './pdf-text.js'
Test Files 1 failed (1)
Tests no tests
```

This was the expected missing-adapter failure for the Task 5 implementation boundary.

## GREEN evidence

Command:

```powershell
npm.cmd test -- src/adapters/pdf-text.test.ts
```

Observed result after implementation:

```text
Test Files 1 passed (1)
Tests 6 passed (6)
```

## Verification results

Fresh bounded checks run before commit:

```powershell
npm.cmd test -- src/adapters/pdf-text.test.ts
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
git diff --check
```

Results:

- Focused PDF adapter test: 1 file passed, 6 tests passed.
- Full current test suite: 5 files passed, 34 tests passed.
- Typecheck: passed.
- Lint: passed.
- Format check: passed.
- `git diff --check`: passed.

## Commit

- Commit: `863d065b14b0268fddf5c1b5de27e2076e396cd3`
- Message: `feat: parse positioned AWB PDF text`
- Signature verification:

```text
gpg: Good signature from "z0zero (GitHub Key) <briansangapta@gmail.com>" [ultimate]
```

## Review fix loop

Review file:

- `.superpowers/sdd/2026-08-03-shopee-awb-sku-exporter/task-5-review.md`

Fix scope:

- Prevented adjacent product/variation-column text from being owned as a SKU when it merely crosses into the SKU band.
- Narrowed wrapped product-name continuation suppression so a close, distinct body row with product/variation content but missing identity columns becomes a partial extraction warning instead of a silent complete result.

RED command:

```powershell
npm.cmd test -- src/adapters/pdf-text.test.ts
```

Observed RED before the fix:

```text
Test Files 1 failed (1)
Tests 2 failed | 6 passed (8)
```

The two failing regression tests were:

- `rejects adjacent-column text that only crosses into the SKU band`
- `does not hide a distinct malformed body row as wrapped product text`

GREEN command:

```powershell
npm.cmd test -- src/adapters/pdf-text.test.ts
```

Observed GREEN after the fix:

```text
Test Files 1 passed (1)
Tests 8 passed (8)
```

Fresh bounded checks after the review fix:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
git diff --check
```

Results:

- Full current test suite: 5 files passed, 36 tests passed.
- Typecheck: passed.
- Lint: passed.
- Format check: passed.
- `git diff --check`: passed.

## Unverified items

- No `RESI.pdf` or customer data was used.
- Later pipeline/PDF.js document loading tasks were not started.
- Browser extension packaging and manual Chrome/Edge checks remain for later tasks.
