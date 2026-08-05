import type { AggregatedSku } from './types.js';

const CSV_NEEDS_QUOTING = /[",\r\n]/u;

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function escapeCsvCell(value: string): string {
  if (!CSV_NEEDS_QUOTING.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

export function serializeCsv(rows: readonly AggregatedSku[]): Uint8Array {
  const csvRows = [
    ['SKU', 'Jumlah'],
    ...rows.map((row) => [row.sku, String(row.quantity)]),
  ].map((row) => row.map(escapeCsvCell).join(','));

  return new TextEncoder().encode(`\uFEFF${csvRows.join('\r\n')}\r\n`);
}

export function buildCsvFilename(now: Date): string {
  const year = now.getFullYear();
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  const hours = padDatePart(now.getHours());
  const minutes = padDatePart(now.getMinutes());
  const seconds = padDatePart(now.getSeconds());

  return `shopee-awb-sku-${year}${month}${day}-${hours}${minutes}${seconds}.csv`;
}
