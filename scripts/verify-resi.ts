import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { aggregateRows } from '../src/core/aggregate.js';
import { DEFAULT_PDF_LIMITS } from '../src/adapters/pdf-policy.js';
import { readPdfTextDocument } from '../src/adapters/pdf-document.js';
import { extractPdfTextRows } from '../src/adapters/pdf-text.js';
import type { AdapterResult, WarningCode } from '../src/core/types.js';

interface FixtureSummary {
  pageCount: number;
  labelsInspected: number;
  rowsDetected: number;
  uniqueSkus: number;
  totalQuantity: number;
  warningCount: number;
  warningCodeCounts: Partial<Record<WarningCode, number>>;
  status: string;
}

export function buildFixtureSummary(
  pageCount: number,
  adapterResult: AdapterResult,
): FixtureSummary {
  const aggregation = aggregateRows(adapterResult.rows);
  const warningCodeCounts = Object.fromEntries(
    [...new Set(adapterResult.warnings.map((warning) => warning.code))]
      .sort()
      .map((code) => [
        code,
        adapterResult.warnings.filter((warning) => warning.code === code)
          .length,
      ]),
  ) as Partial<Record<WarningCode, number>>;

  return {
    pageCount,
    labelsInspected: adapterResult.labelsInspected,
    rowsDetected: adapterResult.rows.length,
    uniqueSkus: aggregation.uniqueSkus,
    totalQuantity: aggregation.totalQuantity,
    warningCount: adapterResult.warnings.length,
    warningCodeCounts,
    status: adapterResult.status,
  };
}

export function serializeFixtureSummary(summary: FixtureSummary): string {
  return JSON.stringify(summary);
}

export function formatFixtureError(_error: unknown): string {
  void _error;
  return 'Fixture verification failed.\n';
}

function usage(): never {
  throw new Error('Usage: npm.cmd run verify:fixture -- <local-pdf-path>');
}

function isUnexpectedFixtureSummary(summary: FixtureSummary): boolean {
  return (
    summary.pageCount !== 50 ||
    summary.rowsDetected <= 0 ||
    summary.uniqueSkus <= 0 ||
    summary.rowsDetected < summary.uniqueSkus ||
    summary.totalQuantity <= 0
  );
}

export async function readBoundedPdfBytes(
  filePath: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const handle = await open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    if (size > maxBytes) {
      throw new Error('Private fixture exceeds the PDF byte limit.');
    }

    const buffer = Buffer.allocUnsafe(Math.min(size + 1, maxBytes + 1));
    let bytesRead = 0;
    while (bytesRead < buffer.byteLength) {
      const result = await handle.read(
        buffer,
        bytesRead,
        buffer.byteLength - bytesRead,
        bytesRead,
      );
      if (result.bytesRead === 0) {
        break;
      }
      bytesRead += result.bytesRead;
    }

    if (bytesRead > maxBytes || (await handle.stat()).size > maxBytes) {
      throw new Error('Private fixture exceeds the PDF byte limit.');
    }

    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const [, , filePath] = process.argv;
  if (filePath === undefined || filePath.trim() === '') {
    usage();
  }

  const bytes = await readBoundedPdfBytes(
    filePath,
    DEFAULT_PDF_LIMITS.maxBytes,
  );

  const document = await readPdfTextDocument(
    new Uint8Array(bytes),
    getDocument,
    DEFAULT_PDF_LIMITS,
  );
  const adapterResult = extractPdfTextRows(document);
  const summary = buildFixtureSummary(document.pageCount, adapterResult);

  process.stdout.write(`${serializeFixtureSummary(summary)}\n`);
  if (isUnexpectedFixtureSummary(summary)) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(formatFixtureError(error));
    process.exitCode = 1;
  }
}
