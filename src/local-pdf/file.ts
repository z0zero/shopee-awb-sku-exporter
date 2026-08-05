import {
  DEFAULT_PDF_LIMITS,
  hasPdfMagic,
  type PdfLimits,
} from '../adapters/pdf-policy.js';

export interface LocalPdfFile {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type LocalPdfFileErrorCode =
  'EMPTY_FILE' | 'PDF_TOO_LARGE' | 'INVALID_PDF_TYPE' | 'INACCESSIBLE_SOURCE';

export class LocalPdfFileError extends Error {
  constructor(readonly code: LocalPdfFileErrorCode) {
    super('The selected PDF could not be read.');
    this.name = 'LocalPdfFileError';
  }
}

export async function readLocalPdfBytes(
  file: LocalPdfFile,
  limits: PdfLimits = DEFAULT_PDF_LIMITS,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new LocalPdfFileError('EMPTY_FILE');
  }

  if (file.size > limits.maxBytes) {
    throw new LocalPdfFileError('PDF_TOO_LARGE');
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new LocalPdfFileError('INACCESSIBLE_SOURCE');
  }

  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(new Uint8Array(buffer));

  if (bytes.byteLength === 0) {
    throw new LocalPdfFileError('EMPTY_FILE');
  }

  if (bytes.byteLength > limits.maxBytes) {
    throw new LocalPdfFileError('PDF_TOO_LARGE');
  }

  if (!hasPdfMagic(bytes)) {
    throw new LocalPdfFileError('INVALID_PDF_TYPE');
  }

  return bytes;
}
