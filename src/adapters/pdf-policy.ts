export interface PdfLimits {
  maxBytes: number;
  maxPages: number;
}

export const DEFAULT_PDF_LIMITS: PdfLimits = {
  maxBytes: 50 * 1024 * 1024,
  maxPages: 500,
};

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export function hasPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_MAGIC.length &&
    PDF_MAGIC.every((value, index) => bytes[index] === value)
  );
}
