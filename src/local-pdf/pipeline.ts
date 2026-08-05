import type { PdfTextDocument } from '../adapters/pdf-text.js';
import { buildScanResult } from '../core/scan-result.js';
import type { AdapterResult, ScanResult } from '../core/types.js';
import { LocalPdfFileError, type LocalPdfFile } from './file.js';

export interface LocalPdfDependencies {
  readBytes(file: LocalPdfFile): Promise<Uint8Array>;
  readPdf(data: Uint8Array): Promise<PdfTextDocument>;
  extractPdf(document: PdfTextDocument): AdapterResult;
}

function inaccessibleResult(): AdapterResult {
  return {
    status: 'inaccessible',
    labelsInspected: 0,
    rows: [],
    warnings: [{ code: 'INACCESSIBLE_SOURCE', message: '' }],
  };
}

export async function scanLocalPdf(
  file: LocalPdfFile,
  dependencies: LocalPdfDependencies,
): Promise<ScanResult> {
  try {
    const bytes = await dependencies.readBytes(file);
    const document = await dependencies.readPdf(bytes);
    const adapterResult = dependencies.extractPdf(document);
    return buildScanResult(adapterResult);
  } catch (error) {
    if (error instanceof LocalPdfFileError) {
      throw error;
    }

    return buildScanResult(inaccessibleResult());
  }
}
