import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  buildFixtureSummary,
  formatFixtureError,
  readBoundedPdfBytes,
  serializeFixtureSummary,
} from '../scripts/verify-resi.js';
import { DEFAULT_PDF_LIMITS } from '../src/adapters/pdf-policy.js';
import type { AdapterResult } from '../src/core/types.js';

describe('readBoundedPdfBytes', () => {
  test('rejects a synthetic oversized file before reading PDF bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'shopee-awb-fixture-'));
    const filePath = join(directory, 'synthetic-oversized.pdf');
    const handle = await open(filePath, 'w');

    try {
      await handle.truncate(DEFAULT_PDF_LIMITS.maxBytes + 1);
    } finally {
      await handle.close();
    }

    try {
      await expect(
        readBoundedPdfBytes(filePath, DEFAULT_PDF_LIMITS.maxBytes),
      ).rejects.toThrow('Private fixture exceeds the PDF byte limit.');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('fixture summary serialization', () => {
  test('serializes only aggregate fields and sorted generic warning-code counts', () => {
    const adapterResult: AdapterResult = {
      status: 'partial',
      labelsInspected: 2,
      rows: [
        {
          sku: 'SYNTHETIC-SKU-MUST-NOT-ESCAPE',
          quantity: 3,
          labelIndex: 1,
          source: 'pdf',
        },
      ],
      warnings: [
        { code: 'INVALID_QTY', message: 'ignored' },
        { code: 'MISSING_SKU', message: 'ignored' },
        { code: 'INVALID_QTY', message: 'ignored' },
      ],
    };

    const summary = buildFixtureSummary(2, adapterResult);
    const serialized = serializeFixtureSummary(summary);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual([
      'labelsInspected',
      'pageCount',
      'rowsDetected',
      'status',
      'totalQuantity',
      'uniqueSkus',
      'warningCodeCounts',
      'warningCount',
    ]);
    expect(parsed).toMatchObject({
      pageCount: 2,
      labelsInspected: 2,
      rowsDetected: 1,
      uniqueSkus: 1,
      totalQuantity: 3,
      warningCount: 3,
      warningCodeCounts: {
        INVALID_QTY: 2,
        MISSING_SKU: 1,
      },
      status: 'partial',
    });
    expect(
      Object.keys(parsed.warningCodeCounts as Record<string, unknown>),
    ).toEqual(['INVALID_QTY', 'MISSING_SKU']);
    expect(serialized).not.toContain('SYNTHETIC-SKU-MUST-NOT-ESCAPE');
  });
});

describe('fixture CLI error formatting', () => {
  test('redacts sensitive paths, raw filesystem details, and stacks', () => {
    const sensitivePath = 'D:\\private\\customer-name\\RESI-12345.pdf';
    const rawError = new Error(
      `ENOENT: no such file or directory, open '${sensitivePath}'`,
    );
    rawError.stack = `${rawError.stack}\n    at readBoundedPdfBytes (${sensitivePath}:42:7)`;

    const formatted = formatFixtureError(rawError);

    expect(formatted).toBe('Fixture verification failed.\n');
    expect(formatted).not.toContain(sensitivePath);
    expect(formatted).not.toContain('ENOENT');
    expect(formatted).not.toContain('at readBoundedPdfBytes');
  });
});
