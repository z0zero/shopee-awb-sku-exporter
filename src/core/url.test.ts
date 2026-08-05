import { describe, expect, test } from 'vitest';

import { isSupportedAwbUrl } from './url.js';

describe('isSupportedAwbUrl', () => {
  test('accepts the exact HTTPS AWB route with any query string', () => {
    expect(isSupportedAwbUrl('https://seller.shopee.co.id/awbprint')).toBe(
      true,
    );
    expect(
      isSupportedAwbUrl(
        'https://seller.shopee.co.id/awbprint?order=123&format=pdf',
      ),
    ).toBe(true);
  });

  test('rejects insecure, credentialed, ported, lookalike, and wrong routes', () => {
    const values = [
      'http://seller.shopee.co.id/awbprint',
      'https://seller.shopee.co.id:443/awbprint',
      'https://user:pass@seller.shopee.co.id/awbprint',
      'https://seller.shopee.co.id.evil.test/awbprint',
      'https://evil.seller.shopee.co.id/awbprint',
      'https://seller.shopee.co.id/awbprint/',
      'https://seller.shopee.co.id/orders',
      'https://seller.shopee.co.id/awbprint#fragment',
    ];

    for (const value of values) {
      expect(isSupportedAwbUrl(value)).toBe(false);
    }
  });

  test('rejects malformed URLs', () => {
    expect(isSupportedAwbUrl('not a URL')).toBe(false);
    expect(isSupportedAwbUrl('')).toBe(false);
  });
});
