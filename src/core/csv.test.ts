import { describe, expect, test } from 'vitest';

import { buildCsvFilename, escapeCsvCell, serializeCsv } from './csv.js';
import type { AggregatedSku } from './types.js';

const textDecoder = new TextDecoder();

describe('escapeCsvCell', () => {
  test('leaves plain and empty cells unquoted', () => {
    expect(escapeCsvCell('SKU-001')).toBe('SKU-001');
    expect(escapeCsvCell('')).toBe('');
  });

  test('quotes commas, quotes, CR, and LF using doubled internal quotes', () => {
    expect(escapeCsvCell('ABC,2')).toBe('"ABC,2"');
    expect(escapeCsvCell('ABC"2')).toBe('"ABC""2"');
    expect(escapeCsvCell('ABC\r2')).toBe('"ABC\r2"');
    expect(escapeCsvCell('ABC\n2')).toBe('"ABC\n2"');
  });
});

describe('serializeCsv', () => {
  test('emits UTF-8 BOM bytes and only the exact CRLF header for empty rows', () => {
    const bytes = serializeCsv([]);

    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(textDecoder.decode(bytes)).toBe('SKU,Jumlah\r\n');
  });

  test('serializes rows in supplied first-seen order with CRLF after every row', () => {
    const rows: readonly AggregatedSku[] = [
      { sku: '001-ABC', quantity: 5 },
      { sku: 'A/B-02._X', quantity: 1 },
      { sku: 'ABC,2', quantity: 3 },
      { sku: 'ABC"2', quantity: 4 },
      { sku: 'ABC\r2', quantity: 6 },
      { sku: 'ABC\n2', quantity: 7 },
      { sku: '', quantity: 8 },
    ];

    expect(textDecoder.decode(serializeCsv(rows))).toBe(
      'SKU,Jumlah\r\n' +
        '001-ABC,5\r\n' +
        'A/B-02._X,1\r\n' +
        '"ABC,2",3\r\n' +
        '"ABC""2",4\r\n' +
        '"ABC\r2",6\r\n' +
        '"ABC\n2",7\r\n' +
        ',8\r\n',
    );
  });

  test('preserves formula-leading SKU text exactly without CSV formula escaping or numeric coercion', () => {
    const rows: readonly AggregatedSku[] = [
      { sku: '=1+2', quantity: 1 },
      { sku: '+PROMO', quantity: 2 },
      { sku: '-PROMO', quantity: 3 },
      { sku: '@PROMO', quantity: 4 },
      { sku: '000123', quantity: 5 },
    ];

    expect(textDecoder.decode(serializeCsv(rows))).toBe(
      'SKU,Jumlah\r\n' +
        '=1+2,1\r\n' +
        '+PROMO,2\r\n' +
        '-PROMO,3\r\n' +
        '@PROMO,4\r\n' +
        '000123,5\r\n',
    );
  });
});

describe('buildCsvFilename', () => {
  test('uses supplied local date components for a deterministic filename', () => {
    expect(buildCsvFilename(new Date(2026, 7, 3, 14, 5, 9))).toBe(
      'shopee-awb-sku-20260803-140509.csv',
    );
  });
});
