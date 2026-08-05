import type { QuantityParseResult } from './types.js';

const INTERNAL_WHITESPACE = /\s+/gu;
const BASE_TEN_INTEGER = /^[0-9]+$/u;

export function normalizeSku(raw: string): string {
  return raw.trim().replace(INTERNAL_WHITESPACE, ' ');
}

export function parseQuantity(raw: string): QuantityParseResult {
  const trimmed = raw.trim();

  if (!BASE_TEN_INTEGER.test(trimmed)) {
    return { ok: false, code: 'INVALID_QTY' };
  }

  const value = Number(trimmed);

  if (!Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, code: 'INVALID_QTY' };
  }

  return { ok: true, value };
}
