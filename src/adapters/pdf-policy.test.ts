import { describe, expect, test } from 'vitest';

import { DEFAULT_PDF_LIMITS, hasPdfMagic } from './pdf-policy.js';

describe('PDF input policy', () => {
  test('defines the shared default byte and page limits', () => {
    expect(DEFAULT_PDF_LIMITS).toEqual({
      maxBytes: 50 * 1024 * 1024,
      maxPages: 500,
    });
  });

  test('recognizes the exact PDF magic prefix', () => {
    expect(
      hasPdfMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])),
    ).toBe(true);
  });

  test('rejects shorter or incorrect prefixes', () => {
    expect(hasPdfMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false);
    expect(hasPdfMagic(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2e]))).toBe(
      false,
    );
  });

  test('does not mutate the input bytes', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const before = bytes.slice();

    hasPdfMagic(bytes);

    expect(bytes).toEqual(before);
  });
});
