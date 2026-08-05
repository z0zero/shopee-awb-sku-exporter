import { describe, expect, test } from 'vitest';

import { normalizeSku, parseQuantity } from './normalize.js';

describe('normalizeSku', () => {
  test('trims outer whitespace while preserving leading zeroes', () => {
    expect(normalizeSku('  001-ABC  ')).toBe('001-ABC');
  });

  test('collapses internal whitespace runs to one ASCII space', () => {
    expect(normalizeSku('A\t\nB')).toBe('A B');
  });

  test('preserves meaningful SKU punctuation', () => {
    expect(normalizeSku('  A/B-02._X  ')).toBe('A/B-02._X');
  });
});

describe('parseQuantity', () => {
  test('accepts a trimmed positive integer quantity', () => {
    expect(parseQuantity(' 12 ')).toEqual({ ok: true, value: 12 });
  });

  test('rejects zero because quantities must be positive', () => {
    expect(parseQuantity('0')).toEqual({ ok: false, code: 'INVALID_QTY' });
  });

  test('rejects negative quantities', () => {
    expect(parseQuantity('-1')).toEqual({ ok: false, code: 'INVALID_QTY' });
  });

  test('rejects decimal quantities', () => {
    expect(parseQuantity('1.5')).toEqual({ ok: false, code: 'INVALID_QTY' });
  });

  test('rejects exponent notation quantities', () => {
    expect(parseQuantity('1e2')).toEqual({ ok: false, code: 'INVALID_QTY' });
  });

  test('rejects empty quantities', () => {
    expect(parseQuantity('')).toEqual({ ok: false, code: 'INVALID_QTY' });
  });

  test('rejects quantities above JavaScript safe integer range', () => {
    expect(parseQuantity('9007199254740992')).toEqual({
      ok: false,
      code: 'INVALID_QTY',
    });
  });
});
