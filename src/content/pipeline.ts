import { isSupportedAwbUrl } from '../core/url.js';
import {
  buildScanResult,
  normalizeAdapterResult,
} from '../core/scan-result.js';
import type {
  AdapterResult,
  ScanResult,
  ScanStatus,
} from '../core/types.js';
import { extractDomRows } from '../adapters/dom.js';
import { extractPdfTextRows } from '../adapters/pdf-text.js';
import type { PdfTextDocument } from '../adapters/pdf-text.js';
import { fetchPdfBytes, discoverPdfSource } from './pdf-source.js';
import { readPdfTextDocument } from '../adapters/pdf-document.js';
import { collectAccessibleDocuments } from './documents.js';

export interface ScanDependencies {
  extractDom: typeof extractDomRows;
  discoverPdf: typeof discoverPdfSource;
  fetchPdf: typeof fetchPdfBytes;
  readPdf: typeof readPdfTextDocument;
  extractPdf: typeof extractPdfTextRows;
}

type CandidateSource = 'dom' | 'pdf';

interface Candidate {
  source: CandidateSource;
  result: AdapterResult;
}

function inaccessibleResult(): AdapterResult {
  return normalizeAdapterResult({
    status: 'inaccessible',
    labelsInspected: 0,
    rows: [],
    warnings: [{ code: 'INACCESSIBLE_SOURCE', message: '' }],
  });
}

function unsupportedResult(): AdapterResult {
  return normalizeAdapterResult({
    status: 'unsupported',
    labelsInspected: 0,
    rows: [],
    warnings: [{ code: 'UNSUPPORTED_LAYOUT', message: '' }],
  });
}

function safeExtractDom(
  document: Document,
  extractDom: typeof extractDomRows,
): AdapterResult {
  try {
    return normalizeAdapterResult(extractDom(document));
  } catch {
    return inaccessibleResult();
  }
}

function withInaccessibleFrame(result: AdapterResult): AdapterResult {
  const normalized = normalizeAdapterResult({
    ...result,
    status: 'complete',
  });
  const warnings = [...normalized.warnings];

  if (!warnings.some((item) => item.code === 'INACCESSIBLE_SOURCE')) {
    warnings.push({ code: 'INACCESSIBLE_SOURCE', message: '' });
  }
  if (!warnings.some((item) => item.code === 'PARTIAL_EXTRACTION')) {
    warnings.push({ code: 'PARTIAL_EXTRACTION', message: '' });
  }

  return { ...normalized, status: 'partial', warnings };
}

function statusRank(status: ScanStatus): number {
  switch (status) {
    case 'complete':
      return 4;
    case 'partial':
      return 3;
    case 'empty':
      return 2;
    case 'inaccessible':
      return 1;
    case 'unsupported':
      return 0;
  }
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const statusDifference =
    statusRank(left.result.status) - statusRank(right.result.status);
  if (statusDifference !== 0) {
    return statusDifference;
  }

  const rowDifference = left.result.rows.length - right.result.rows.length;
  if (rowDifference !== 0) {
    return rowDifference;
  }

  const labelDifference =
    left.result.labelsInspected - right.result.labelsInspected;
  if (labelDifference !== 0) {
    return labelDifference;
  }

  return left.source === 'dom' && right.source === 'pdf' ? 1 : 0;
}

function chooseCandidate(
  candidates: readonly Candidate[],
): Candidate | undefined {
  return candidates.reduce<Candidate | undefined>((best, candidate) => {
    if (best === undefined || compareCandidates(candidate, best) > 0) {
      return candidate;
    }
    return best;
  }, undefined);
}

async function pdfCandidate(
  pageUrl: URL,
  documents: readonly Document[],
  dependencies: ScanDependencies,
): Promise<Candidate | undefined> {
  let discovery;
  try {
    discovery = dependencies.discoverPdf(documents, pageUrl);
  } catch {
    return { source: 'pdf', result: inaccessibleResult() };
  }

  if (discovery.status === 'none') {
    return undefined;
  }

  if (discovery.status === 'ambiguous') {
    return { source: 'pdf', result: unsupportedResult() };
  }

  try {
    const bytes = await dependencies.fetchPdf(discovery.source, pageUrl);
    const readConfiguredPdf = dependencies.readPdf as unknown as (
      data: Uint8Array,
    ) => Promise<PdfTextDocument>;
    const document = await readConfiguredPdf(bytes);
    return {
      source: 'pdf',
      result: normalizeAdapterResult(dependencies.extractPdf(document)),
    };
  } catch {
    return { source: 'pdf', result: inaccessibleResult() };
  }
}

function frameDomCandidate(
  root: AdapterResult,
  frameResults: readonly AdapterResult[],
  inaccessibleCount: number,
): Candidate | undefined {
  if (root.status !== 'unsupported') {
    return { source: 'dom', result: root };
  }

  const rowBearing = frameResults.filter(
    (result) =>
      (result.status === 'complete' || result.status === 'partial') &&
      result.rows.length > 0,
  );
  if (rowBearing.length > 1) {
    const result = unsupportedResult();
    if (inaccessibleCount > 0) {
      result.warnings.push({ code: 'INACCESSIBLE_SOURCE', message: '' });
    }
    return { source: 'dom', result };
  }

  if (rowBearing.length === 1) {
    const selected = rowBearing[0];
    if (selected === undefined) {
      return undefined;
    }
    return {
      source: 'dom',
      result:
        inaccessibleCount > 0 ? withInaccessibleFrame(selected) : selected,
    };
  }

  const empty = frameResults.find((result) => result.status === 'empty');
  if (empty !== undefined) {
    return {
      source: 'dom',
      result: inaccessibleCount > 0 ? withInaccessibleFrame(empty) : empty,
    };
  }

  return inaccessibleCount > 0
    ? { source: 'dom', result: inaccessibleResult() }
    : { source: 'dom', result: root };
}

export async function scanAwbPage(
  pageUrl: string,
  root: Document,
  dependencies: ScanDependencies,
): Promise<ScanResult> {
  if (!isSupportedAwbUrl(pageUrl)) {
    return {
      status: 'unsupported',
      labelsInspected: 0,
      rowsDetected: 0,
      uniqueSkus: 0,
      totalQuantity: 0,
      rows: [],
      warnings: [],
    };
  }

  let activeUrl: URL;
  try {
    activeUrl = new URL(pageUrl);
  } catch {
    return buildScanResult(inaccessibleResult());
  }

  const rootResult = safeExtractDom(root, dependencies.extractDom);
  if (rootResult.status === 'complete') {
    return buildScanResult(rootResult);
  }

  let collection;
  try {
    collection = collectAccessibleDocuments(root);
  } catch {
    return buildScanResult(inaccessibleResult());
  }

  const frameResults =
    rootResult.status === 'unsupported'
      ? collection.frameDocuments.map((document) =>
          safeExtractDom(document, dependencies.extractDom),
        )
      : [];
  const dom = frameDomCandidate(
    rootResult,
    frameResults,
    collection.inaccessibleCandidateFrameCount,
  );

  if (dom?.result.status === 'complete') {
    return buildScanResult(dom.result);
  }

  const documents = [collection.root, ...collection.frameDocuments];
  const pdf = await pdfCandidate(activeUrl, documents, dependencies);
  const candidates = [dom, pdf].filter(
    (candidate): candidate is Candidate => candidate !== undefined,
  );

  if (candidates.length === 0) {
    return buildScanResult(
      collection.inaccessibleCandidateFrameCount > 0
        ? inaccessibleResult()
        : unsupportedResult(),
    );
  }

  const selected = chooseCandidate(candidates);
  return buildScanResult(selected?.result ?? inaccessibleResult());
}
