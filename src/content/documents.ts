export interface DocumentCollection {
  root: Document;
  frameDocuments: Document[];
  inaccessibleCandidateFrameCount: number;
}

const PDF_MIME = 'application/pdf';

function normalized(value: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

function isPdfMime(value: string | null): boolean {
  return normalized(value).split(';', 1)[0] === PDF_MIME;
}

function embeddedBlobOrigin(url: URL): string | undefined {
  if (url.protocol !== 'blob:') {
    return undefined;
  }

  try {
    return new URL(url.pathname).origin;
  } catch {
    return undefined;
  }
}

function sameOrigin(url: URL, origin: string): boolean {
  if (url.protocol === 'blob:') {
    return embeddedBlobOrigin(url) === origin;
  }

  return url.origin === origin;
}

function resolveUrl(raw: string | null, base: string): URL | undefined {
  try {
    return raw === null ? new URL(base) : new URL(raw, base);
  } catch {
    return undefined;
  }
}

function documentBase(document: Document): string {
  return document.baseURI || document.URL;
}

function frameCandidate(
  frame: HTMLIFrameElement,
  owner: Document,
  rootOrigin: string,
): { candidate: boolean; declaredSameOrigin: boolean | undefined } {
  const source = frame.getAttribute('src');
  const sourceUrl = resolveUrl(source, frame.baseURI || documentBase(owner));
  const typeHint = isPdfMime(frame.getAttribute('type'));
  const textHint =
    `${frame.getAttribute('title') ?? ''} ${frame.getAttribute('role') ?? ''}`
      .trim()
      .toLowerCase();
  const viewerHint =
    textHint.includes('pdf') ||
    textHint.includes('viewer') ||
    textHint.includes('print');

  const routeHint =
    sourceUrl?.pathname === '/awbprint' &&
    sourceUrl.protocol === 'https:' &&
    sourceUrl.origin === rootOrigin;
  const pdfPathHint =
    sourceUrl?.protocol === 'https:' &&
    sourceUrl.origin === rootOrigin &&
    sourceUrl.pathname.toLowerCase().endsWith('.pdf');
  const blobPdfHint =
    sourceUrl?.protocol === 'blob:' &&
    embeddedBlobOrigin(sourceUrl) === rootOrigin;
  const candidate =
    typeHint || viewerHint || routeHint || pdfPathHint || blobPdfHint;

  return {
    candidate,
    declaredSameOrigin:
      sourceUrl === undefined ? undefined : sameOrigin(sourceUrl, rootOrigin),
  };
}

function accessibleSameOrigin(
  frameDocument: Document,
  declaredSameOrigin: boolean | undefined,
  rootOrigin: string,
): boolean {
  if (declaredSameOrigin === false) {
    return false;
  }

  try {
    const frameUrl = new URL(frameDocument.URL);
    return frameUrl.origin === rootOrigin || frameUrl.origin === 'null';
  } catch {
    return declaredSameOrigin === true;
  }
}

export function collectAccessibleDocuments(root: Document): DocumentCollection {
  const rootOrigin = (() => {
    try {
      return new URL(root.URL).origin;
    } catch {
      return 'null';
    }
  })();
  const seen = new Set<Document>([root]);
  const includedFrameDocuments = new Set<Document>();
  const pending: Document[] = [root];
  const frameDocuments: Document[] = [];
  let inaccessibleCandidateFrameCount = 0;

  while (pending.length > 0) {
    const document = pending.shift();
    if (document === undefined) {
      continue;
    }

    for (const element of document.querySelectorAll('iframe')) {
      const frame = element as HTMLIFrameElement;
      const hint = frameCandidate(frame, document, rootOrigin);
      let frameDocument: Document | null;

      try {
        frameDocument = frame.contentDocument;
      } catch {
        if (hint.candidate) {
          inaccessibleCandidateFrameCount += 1;
        }
        continue;
      }

      if (
        frameDocument === null ||
        !accessibleSameOrigin(
          frameDocument,
          hint.declaredSameOrigin,
          rootOrigin,
        )
      ) {
        if (hint.candidate) {
          inaccessibleCandidateFrameCount += 1;
        }
        continue;
      }

      if (seen.has(frameDocument)) {
        if (
          frameDocument !== root &&
          !includedFrameDocuments.has(frameDocument)
        ) {
          includedFrameDocuments.add(frameDocument);
          frameDocuments.push(frameDocument);
        }
        continue;
      }

      seen.add(frameDocument);
      pending.push(frameDocument);
      if (frameDocument !== root) {
        includedFrameDocuments.add(frameDocument);
        frameDocuments.push(frameDocument);
      }
    }
  }

  return { root, frameDocuments, inaccessibleCandidateFrameCount };
}
