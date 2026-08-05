import {
  DEFAULT_PDF_LIMITS,
  hasPdfMagic,
  type PdfLimits,
} from '../adapters/pdf-policy.js';

export interface PdfSourceCandidate {
  kind: 'https' | 'blob';
  url: string;
}

export type PdfSourceDiscovery =
  | { status: 'found'; source: PdfSourceCandidate }
  | { status: 'none' }
  | { status: 'ambiguous' };

export type PdfSourceErrorCode =
  | 'INVALID_PDF_SOURCE'
  | 'PDF_REDIRECT'
  | 'PDF_TOO_LARGE'
  | 'INVALID_PDF_TYPE'
  | 'INACCESSIBLE_SOURCE';

export class PdfSourceError extends Error {
  constructor(readonly code: PdfSourceErrorCode) {
    super(messageForCode(code));
    this.name = 'PdfSourceError';
  }
}

const SHOPEE_SELLER_ORIGIN = 'https://seller.shopee.co.id';
function messageForCode(code: PdfSourceErrorCode): string {
  switch (code) {
    case 'INVALID_PDF_SOURCE':
      return 'PDF source is not supported.';
    case 'PDF_REDIRECT':
      return 'PDF source could not be loaded directly.';
    case 'PDF_TOO_LARGE':
      return 'PDF source exceeds the supported size limit.';
    case 'INVALID_PDF_TYPE':
      return 'PDF source is not a valid PDF.';
    case 'INACCESSIBLE_SOURCE':
      return 'PDF source could not be read.';
  }
}

function isPdfType(value: string | null | undefined): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/pdf';
}

function isPdfDocument(document: Document): boolean {
  return isPdfType(document.contentType);
}

function hasPdfViewerHint(element: HTMLIFrameElement): boolean {
  const title = element.getAttribute('title') ?? '';
  const role = element.getAttribute('role') ?? '';
  const type = element.getAttribute('type') ?? '';
  const combined = `${title} ${role} ${type}`.toLowerCase();
  return combined.includes('pdf') || combined.includes('viewer');
}

function blobOrigin(url: URL): string | undefined {
  if (url.protocol !== 'blob:') {
    return undefined;
  }

  try {
    const embeddedUrl = new URL(url.pathname);
    if (
      embeddedUrl.username !== '' ||
      embeddedUrl.password !== '' ||
      embeddedUrl.hash !== ''
    ) {
      return undefined;
    }

    return embeddedUrl.origin;
  } catch {
    return undefined;
  }
}

function resolveBaseUrl(
  raw: string | null | undefined,
  fallback: URL,
): URL | undefined {
  try {
    return new URL(raw ?? fallback.href, fallback);
  } catch {
    return undefined;
  }
}

function normalizedCandidate(
  raw: string | null | undefined,
  baseUrl: URL,
): PdfSourceCandidate | undefined {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(raw, baseUrl);
  } catch {
    return undefined;
  }

  if (url.username !== '' || url.password !== '') {
    return undefined;
  }

  if (url.protocol === 'https:') {
    if (url.hash !== '' || url.origin !== SHOPEE_SELLER_ORIGIN) {
      return undefined;
    }

    return { kind: 'https', url: url.href };
  }

  if (url.protocol === 'blob:' && blobOrigin(url) === SHOPEE_SELLER_ORIGIN) {
    url.hash = '';
    return { kind: 'blob', url: url.href };
  }

  return undefined;
}

function pushCandidate(
  candidates: Map<string, PdfSourceCandidate>,
  raw: string | null | undefined,
  baseUrl: URL | undefined,
): void {
  if (baseUrl === undefined) {
    return;
  }

  const candidate = normalizedCandidate(raw, baseUrl);
  if (candidate !== undefined) {
    candidates.set(`${candidate.kind}:${candidate.url}`, candidate);
  }
}

export function discoverPdfSource(
  documents: readonly Document[],
  activePageUrl: URL,
): PdfSourceDiscovery {
  const candidates = new Map<string, PdfSourceCandidate>();

  for (const document of documents) {
    const documentUrl = resolveBaseUrl(document.URL, activePageUrl);
    if (isPdfDocument(document)) {
      pushCandidate(candidates, document.URL, documentUrl);
    }

    for (const element of document.querySelectorAll('embed[type]')) {
      if (isPdfType(element.getAttribute('type'))) {
        pushCandidate(
          candidates,
          element.getAttribute('src'),
          resolveBaseUrl(element.baseURI, activePageUrl),
        );
      }
    }

    for (const element of document.querySelectorAll(
      'object[type], object[data]',
    )) {
      if (isPdfType(element.getAttribute('type'))) {
        pushCandidate(
          candidates,
          element.getAttribute('data'),
          resolveBaseUrl(element.baseURI, activePageUrl),
        );
      }
    }

    for (const element of document.querySelectorAll('iframe[src]')) {
      const source = element.getAttribute('src');
      const baseUrl = resolveBaseUrl(element.baseURI, activePageUrl);
      const candidate =
        baseUrl === undefined
          ? undefined
          : normalizedCandidate(source, baseUrl);

      if (
        candidate !== undefined &&
        (candidate.kind === 'blob' ||
          hasPdfViewerHint(element as HTMLIFrameElement))
      ) {
        candidates.set(`${candidate.kind}:${candidate.url}`, candidate);
      }
    }
  }

  if (candidates.size === 0) {
    return { status: 'none' };
  }

  if (candidates.size > 1) {
    return { status: 'ambiguous' };
  }

  const source = candidates.values().next().value;
  if (source === undefined) {
    return { status: 'none' };
  }

  return { status: 'found', source };
}

function validateFetchSource(
  source: PdfSourceCandidate,
  activePageUrl: URL,
): void {
  const normalized = normalizedCandidate(source.url, activePageUrl);
  if (
    normalized === undefined ||
    normalized.kind !== source.kind ||
    normalized.url !== source.url
  ) {
    throw new PdfSourceError('INVALID_PDF_SOURCE');
  }
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null || !/^[0-9]+$/u.test(value.trim())) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function readBoundedBytes(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (response.body === null) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PdfSourceError('PDF_TOO_LARGE');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function fetchPdfBytes(
  source: PdfSourceCandidate,
  activePageUrl: URL,
  fetchImpl: typeof fetch = fetch,
  limits: PdfLimits = DEFAULT_PDF_LIMITS,
): Promise<Uint8Array> {
  validateFetchSource(source, activePageUrl);

  let response: Response;
  try {
    response = await fetchImpl(source.url, {
      credentials: 'include',
      redirect: 'error',
    });
  } catch {
    throw new PdfSourceError('INACCESSIBLE_SOURCE');
  }

  if (response.status >= 300 && response.status < 400) {
    throw new PdfSourceError('PDF_REDIRECT');
  }

  if (!response.ok) {
    throw new PdfSourceError('INACCESSIBLE_SOURCE');
  }

  const contentLength = parseContentLength(
    response.headers.get('content-length'),
  );
  if (contentLength !== undefined && contentLength > limits.maxBytes) {
    throw new PdfSourceError('PDF_TOO_LARGE');
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBytes(response, limits.maxBytes);
  } catch (error) {
    if (error instanceof PdfSourceError) {
      throw error;
    }

    throw new PdfSourceError('INACCESSIBLE_SOURCE');
  }

  if (bytes.byteLength > limits.maxBytes) {
    throw new PdfSourceError('PDF_TOO_LARGE');
  }

  if (!isPdfType(response.headers.get('content-type')) && !hasPdfMagic(bytes)) {
    throw new PdfSourceError('INVALID_PDF_TYPE');
  }

  return bytes;
}
