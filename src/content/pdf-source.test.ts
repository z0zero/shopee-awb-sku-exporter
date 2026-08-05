import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';

import type { PdfLimits } from '../adapters/pdf-policy.js';
import {
  discoverPdfSource,
  fetchPdfBytes,
  type PdfSourceCandidate,
} from './pdf-source.js';

const ACTIVE_PAGE_URL = new URL('https://seller.shopee.co.id/awbprint?x=1');
const TIGHT_LIMITS: PdfLimits = { maxBytes: 5, maxPages: 500 };
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function htmlDocument(markup: string, url = ACTIVE_PAGE_URL.href): Document {
  return new JSDOM(markup, { url }).window.document;
}

function pdfDocument(url = `${ACTIVE_PAGE_URL.origin}/viewer/label.pdf`) {
  const document = htmlDocument('<body></body>', url);
  Object.defineProperty(document, 'contentType', {
    configurable: true,
    value: 'application/pdf',
  });
  return document;
}

function source(
  url = `${ACTIVE_PAGE_URL.origin}/label.pdf`,
): PdfSourceCandidate {
  return { kind: 'https', url };
}

function streamResponse(
  chunks: readonly Uint8Array[],
  init: ResponseInit = {},
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    init,
  );
}

describe('discoverPdfSource', () => {
  test('finds and deduplicates same-origin PDF references from allowed source elements and PDF documents', () => {
    const repeated = `${ACTIVE_PAGE_URL.origin}/api/awb.pdf?batch=1`;
    const document = htmlDocument(`
      <embed type="application/pdf" src="${repeated}">
      <object type="application/pdf" data="/api/awb.pdf?batch=1"></object>
      <iframe title="PDF viewer" src="/api/awb.pdf?batch=1"></iframe>
    `);

    expect(discoverPdfSource([document], ACTIVE_PAGE_URL)).toEqual({
      status: 'found',
      source: { kind: 'https', url: repeated },
    });

    expect(discoverPdfSource([pdfDocument()], ACTIVE_PAGE_URL)).toEqual({
      status: 'found',
      source: {
        kind: 'https',
        url: `${ACTIVE_PAGE_URL.origin}/viewer/label.pdf`,
      },
    });
  });

  test('returns ambiguous instead of silently choosing between distinct valid PDF candidates', () => {
    const document = htmlDocument(`
      <embed type="application/pdf" src="/first.pdf">
      <object type="application/pdf" data="/second.pdf"></object>
    `);

    expect(discoverPdfSource([document], ACTIVE_PAGE_URL)).toEqual({
      status: 'ambiguous',
    });
  });

  test('rejects invalid URLs, arbitrary links, cross-origin blobs, and fragment source tricks', () => {
    const document = htmlDocument(`
      <embed type="application/pdf" src="http://seller.shopee.co.id/insecure.pdf">
      <embed type="application/pdf" src="https://user:pass@seller.shopee.co.id/credentialed.pdf">
      <object type="application/pdf" data="https://seller.shopee.co.id.evil.test/lookalike.pdf"></object>
      <iframe title="PDF viewer" src="blob:https://evil.test/11111111-1111-1111-1111-111111111111"></iframe>
      <iframe title="PDF viewer" src="https://seller.shopee.co.id/viewer#https://seller.shopee.co.id/hidden.pdf"></iframe>
      <a href="https://seller.shopee.co.id/not-a-source.pdf">not a source</a>
    `);

    expect(discoverPdfSource([document], ACTIVE_PAGE_URL)).toEqual({
      status: 'none',
    });
  });

  test('accepts same-origin blob PDF candidates only when the embedded blob origin matches Shopee', () => {
    const document = htmlDocument(`
      <iframe title="PDF viewer" src="blob:https://seller.shopee.co.id/11111111-1111-1111-1111-111111111111"></iframe>
    `);

    expect(discoverPdfSource([document], ACTIVE_PAGE_URL)).toEqual({
      status: 'found',
      source: {
        kind: 'blob',
        url: 'blob:https://seller.shopee.co.id/11111111-1111-1111-1111-111111111111',
      },
    });
  });

  test('discovers an unhinted same-origin blob iframe on the AWB page', () => {
    const document = htmlDocument(`
      <iframe src="blob:https://seller.shopee.co.id/22222222-2222-2222-2222-222222222222"></iframe>
    `);

    expect(discoverPdfSource([document], ACTIVE_PAGE_URL)).toEqual({
      status: 'found',
      source: {
        kind: 'blob',
        url: 'blob:https://seller.shopee.co.id/22222222-2222-2222-2222-222222222222',
      },
    });
  });

  test('canonicalizes the client-only viewer fragment on a same-origin blob candidate', () => {
    const document = htmlDocument(`
      <iframe title="PDF viewer" src="blob:https://seller.shopee.co.id/33333333-3333-3333-3333-333333333333#toolbar=0&amp;navpanes=0"></iframe>
    `);

    expect(discoverPdfSource([document], ACTIVE_PAGE_URL)).toEqual({
      status: 'found',
      source: {
        kind: 'blob',
        url: 'blob:https://seller.shopee.co.id/33333333-3333-3333-3333-333333333333',
      },
    });
  });

  test('resolves relative PDF references against the owning nested document base URL', () => {
    const nestedDocument = htmlDocument(
      '<embed type="application/pdf" src="label.pdf">',
      `${ACTIVE_PAGE_URL.origin}/nested/awb/frame.html`,
    );

    expect(discoverPdfSource([nestedDocument], ACTIVE_PAGE_URL)).toEqual({
      status: 'found',
      source: {
        kind: 'https',
        url: `${ACTIVE_PAGE_URL.origin}/nested/awb/label.pdf`,
      },
    });
  });

  test('rejects a relative PDF reference resolved by a hostile document base', () => {
    const document = htmlDocument(`
      <base href="https://evil.test/private/">
      <embed type="application/pdf" src="label.pdf">
    `);

    expect(discoverPdfSource([document], ACTIVE_PAGE_URL)).toEqual({
      status: 'none',
    });
  });

  test('rejects blob PDF candidates with credentials in the embedded URL', () => {
    const document = htmlDocument(`
      <iframe title="PDF viewer" src="blob:https://user:pass@seller.shopee.co.id/private-id"></iframe>
    `);

    expect(discoverPdfSource([document], ACTIVE_PAGE_URL)).toEqual({
      status: 'none',
    });
  });
});

describe('fetchPdfBytes', () => {
  test('uses same-origin credentialed fetch with redirect rejection and accepts a PDF exactly at the byte cap', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(PDF_MAGIC, {
          headers: { 'content-length': '5', 'content-type': 'text/plain' },
        }),
    );

    await expect(
      fetchPdfBytes(source(), ACTIVE_PAGE_URL, fetchImpl, TIGHT_LIMITS),
    ).resolves.toEqual(PDF_MAGIC);
    expect(fetchImpl).toHaveBeenCalledWith(source().url, {
      credentials: 'include',
      redirect: 'error',
    });
  });

  test('rejects oversized content-length before reading the response body', async () => {
    const body = vi.fn(async () =>
      streamResponse([PDF_MAGIC], {
        headers: {
          'content-length': '6',
          'content-type': 'application/pdf',
        },
      }),
    );

    await expect(
      fetchPdfBytes(source(), ACTIVE_PAGE_URL, body, TIGHT_LIMITS),
    ).rejects.toMatchObject({ code: 'PDF_TOO_LARGE' });
  });

  test('rejects chunked PDF bytes when the stream crosses the cap', async () => {
    const fetchImpl = vi.fn(async () =>
      streamResponse(
        [
          new Uint8Array([0x25, 0x50, 0x44]),
          new Uint8Array([0x46, 0x2d, 0x31]),
        ],
        { headers: { 'content-type': 'application/pdf' } },
      ),
    );

    await expect(
      fetchPdfBytes(source(), ACTIVE_PAGE_URL, fetchImpl, TIGHT_LIMITS),
    ).rejects.toMatchObject({ code: 'PDF_TOO_LARGE' });
  });

  test('maps a rejecting response stream to a generic inaccessible-source error', async () => {
    const privateDetail = 'private stream failure detail';
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error(privateDetail));
            },
          }),
          { headers: { 'content-type': 'application/pdf' } },
        ),
    );

    const result = fetchPdfBytes(
      source(),
      ACTIVE_PAGE_URL,
      fetchImpl,
      TIGHT_LIMITS,
    );

    await expect(result).rejects.toMatchObject({
      code: 'INACCESSIBLE_SOURCE',
    });
    await expect(result).rejects.not.toThrow(privateDetail);
  });

  test('maps a null-body arrayBuffer failure to a generic inaccessible-source error', async () => {
    const privateDetail = 'private arrayBuffer failure detail';
    const response = {
      body: null,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      ok: true,
      status: 200,
      arrayBuffer: vi.fn(async () => {
        throw new Error(privateDetail);
      }),
    } as unknown as Response;
    const fetchImpl = vi.fn(async () => response);

    const result = fetchPdfBytes(
      source(),
      ACTIVE_PAGE_URL,
      fetchImpl,
      TIGHT_LIMITS,
    );

    await expect(result).rejects.toMatchObject({
      code: 'INACCESSIBLE_SOURCE',
    });
    await expect(result).rejects.not.toThrow(privateDetail);
  });

  test('rejects wrong MIME responses that also lack PDF magic without leaking URL queries or body text', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('NOPE!', {
          headers: { 'content-type': 'text/html' },
        }),
    );

    await expect(
      fetchPdfBytes(
        source(`${ACTIVE_PAGE_URL.origin}/label.pdf?privateOrder=123`),
        ACTIVE_PAGE_URL,
        fetchImpl,
        TIGHT_LIMITS,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PDF_TYPE' });

    await expect(
      fetchPdfBytes(
        source(`${ACTIVE_PAGE_URL.origin}/label.pdf?privateOrder=123`),
        ACTIVE_PAGE_URL,
        fetchImpl,
        TIGHT_LIMITS,
      ),
    ).rejects.not.toThrow(/privateOrder|private PDF body/u);
  });

  test('rejects redirect responses and cross-origin source candidates', async () => {
    const redirectFetch = vi.fn(
      async () =>
        new Response(PDF_MAGIC, {
          status: 302,
          headers: {
            location: `${ACTIVE_PAGE_URL.origin}/next.pdf`,
            'content-type': 'application/pdf',
          },
        }),
    );

    await expect(
      fetchPdfBytes(source(), ACTIVE_PAGE_URL, redirectFetch, TIGHT_LIMITS),
    ).rejects.toMatchObject({ code: 'PDF_REDIRECT' });
    await expect(
      fetchPdfBytes(
        source('https://seller.shopee.co.id.evil.test/label.pdf'),
        ACTIVE_PAGE_URL,
        redirectFetch,
        TIGHT_LIMITS,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PDF_SOURCE' });
    expect(redirectFetch).toHaveBeenCalledTimes(1);
  });
});
