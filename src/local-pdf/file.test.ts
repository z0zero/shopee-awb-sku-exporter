import { describe, expect, test, vi } from 'vitest';

import { hasPdfMagic, type PdfLimits } from '../adapters/pdf-policy.js';
import { readLocalPdfBytes, type LocalPdfFile } from './file.js';

function syntheticFile(
  size: number,
  bytes: Uint8Array | undefined = undefined,
): LocalPdfFile & { arrayBuffer: ReturnType<typeof vi.fn> } {
  return {
    size,
    arrayBuffer: vi.fn(
      async () => (bytes ?? new Uint8Array()).buffer as ArrayBuffer,
    ),
  };
}

const limits: PdfLimits = { maxBytes: 5, maxPages: 1 };

describe('readLocalPdfBytes', () => {
  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects invalid declared size %s as empty',
    async (size) => {
      const file = syntheticFile(size, new Uint8Array([0x25]));

      await expect(readLocalPdfBytes(file, limits)).rejects.toMatchObject({
        code: 'EMPTY_FILE',
      });
      expect(file.arrayBuffer).not.toHaveBeenCalled();
    },
  );

  test('rejects an oversized declared file before reading it', async () => {
    const file = syntheticFile(limits.maxBytes + 1);

    await expect(readLocalPdfBytes(file, limits)).rejects.toMatchObject({
      code: 'PDF_TOO_LARGE',
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  test('maps a rejected selected-file read to inaccessible source', async () => {
    const file: LocalPdfFile = {
      size: 5,
      arrayBuffer: vi.fn(async () => {
        throw new Error('synthetic read failure');
      }),
    };

    await expect(readLocalPdfBytes(file, limits)).rejects.toMatchObject({
      code: 'INACCESSIBLE_SOURCE',
    });
  });

  test('rejects bytes larger than the declared limit after reading', async () => {
    const file = syntheticFile(
      1,
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]),
    );

    await expect(readLocalPdfBytes(file, limits)).rejects.toMatchObject({
      code: 'PDF_TOO_LARGE',
    });
  });

  test('rejects bytes without the PDF magic header', async () => {
    const file = syntheticFile(
      5,
      new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]),
    );

    await expect(readLocalPdfBytes(file, limits)).rejects.toMatchObject({
      code: 'INVALID_PDF_TYPE',
    });
  });

  test('reads an exact-cap PDF and returns a copied byte array', async () => {
    const source = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const file = syntheticFile(source.byteLength, source);

    const result = await readLocalPdfBytes(file, limits);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(hasPdfMagic(result)).toBe(true);

    source[0] = 0;
    expect(result[0]).toBe(0x25);
  });
});
