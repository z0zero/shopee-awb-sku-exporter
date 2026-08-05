import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';

import { collectAccessibleDocuments } from './documents.js';

const ROOT_URL = 'https://seller.shopee.co.id/awbprint?batch=1';

function documentFrom(markup: string, url = ROOT_URL): Document {
  return new JSDOM(markup, { url }).window.document;
}

function setFrameDocument(
  frame: HTMLIFrameElement,
  value: Document | null | (() => Document | null),
): void {
  Object.defineProperty(frame, 'contentDocument', {
    configurable: true,
    get: typeof value === 'function' ? value : () => value,
  });
}

describe('collectAccessibleDocuments', () => {
  test('collects an accessible same-origin preview frame without presentation hints', () => {
    const root = documentFrom('<iframe src="/print-preview"></iframe>');
    const frame = root.querySelector('iframe');
    if (!(frame instanceof root.defaultView!.HTMLIFrameElement)) {
      throw new Error('missing preview frame');
    }

    const preview = documentFrom(
      '<table><tr><th>SKU</th><th>Qty</th></tr></table>',
      'https://seller.shopee.co.id/print-preview',
    );
    setFrameDocument(frame, preview);

    const result = collectAccessibleDocuments(root);

    expect(result.frameDocuments).toEqual([preview]);
    expect(result.inaccessibleCandidateFrameCount).toBe(0);
  });

  test('collects unique candidate documents recursively and keeps root separate', () => {
    const root = documentFrom(
      '<iframe src="/awbprint?frame=1"></iframe><iframe src="/unrelated"></iframe>',
    );
    const firstFrame = root.querySelector('iframe');
    const unrelatedFrame = root.querySelectorAll('iframe')[1];
    if (!(firstFrame instanceof root.defaultView!.HTMLIFrameElement)) {
      throw new Error('missing first iframe');
    }
    if (!(unrelatedFrame instanceof root.defaultView!.HTMLIFrameElement)) {
      throw new Error('missing unrelated iframe');
    }

    const nested = documentFrom(
      '<iframe title="PDF viewer"></iframe>',
      'https://seller.shopee.co.id/awbprint?frame=1',
    );
    const nestedFrame = nested.querySelector('iframe');
    if (!(nestedFrame instanceof nested.defaultView!.HTMLIFrameElement)) {
      throw new Error('missing nested iframe');
    }
    const nestedPdf = documentFrom(
      '<embed type="application/pdf" src="/labels.pdf">',
      'https://seller.shopee.co.id/awbprint?frame=2',
    );

    setFrameDocument(firstFrame, nested);
    setFrameDocument(nestedFrame, nestedPdf);
    setFrameDocument(unrelatedFrame, null);

    const before = root.body.innerHTML;
    const result = collectAccessibleDocuments(root);

    expect(result.root).toBe(root);
    expect(result.frameDocuments).toEqual([nested, nestedPdf]);
    expect(result.inaccessibleCandidateFrameCount).toBe(0);
    expect(root.body.innerHTML).toBe(before);
  });

  test('counts inaccessible candidate frames without exposing their URL', () => {
    const root = documentFrom(
      '<iframe title="Print viewer" src="https://other.example/print"></iframe>' +
        '<iframe src="https://other.example/unrelated"></iframe>',
    );
    const candidate = root.querySelector('iframe');
    const unrelated = root.querySelectorAll('iframe')[1];
    if (!(candidate instanceof root.defaultView!.HTMLIFrameElement)) {
      throw new Error('missing candidate iframe');
    }
    if (!(unrelated instanceof root.defaultView!.HTMLIFrameElement)) {
      throw new Error('missing unrelated iframe');
    }

    setFrameDocument(candidate, () => {
      throw new Error('cross-origin frame details must not escape');
    });
    setFrameDocument(unrelated, () => {
      throw new Error('unrelated frame details must not escape');
    });

    const result = collectAccessibleDocuments(root);

    expect(result.frameDocuments).toEqual([]);
    expect(result.inaccessibleCandidateFrameCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain('other.example');
  });
});
