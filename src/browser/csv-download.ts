import { aggregateRows } from '../core/aggregate.js';
import { buildCsvFilename, serializeCsv } from '../core/csv.js';
import type { ScanResult } from '../core/types.js';

export interface CsvDownloadPorts {
  download(options: chrome.downloads.DownloadOptions): Promise<number>;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  now(): Date;
}

export type CsvDownloadOutcome =
  'started' | 'acknowledgement-required' | 'unavailable' | 'failed';

export async function downloadScanCsv(
  result: ScanResult | null,
  partialAcknowledged: boolean,
  ports: CsvDownloadPorts,
): Promise<CsvDownloadOutcome> {
  if (result === null) {
    return 'unavailable';
  }

  if (result.status === 'partial' && result.rows.length === 0) {
    return 'unavailable';
  }

  if (result.status === 'partial' && !partialAcknowledged) {
    return 'acknowledgement-required';
  }

  if (result.status !== 'complete' && result.status !== 'partial') {
    return 'unavailable';
  }

  let objectUrl: string | undefined;
  try {
    const aggregated = aggregateRows(result.rows);
    const bytes = serializeCsv(aggregated.rows);
    const blobBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(blobBuffer).set(bytes);
    const blob = new Blob([blobBuffer], { type: 'text/csv;charset=utf-8' });
    objectUrl = ports.createObjectUrl(blob);
    await ports.download({
      url: objectUrl,
      filename: buildCsvFilename(ports.now()),
      saveAs: true,
    });
    return 'started';
  } catch {
    return 'failed';
  } finally {
    if (objectUrl !== undefined) {
      ports.revokeObjectUrl(objectUrl);
    }
  }
}
