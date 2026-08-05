import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';

import type { AdapterResult } from '../core/types.js';
import { registerScanListener } from './index.js';
import type { ScanRuntime } from './index.js';
import type { ScanDependencies } from './pipeline.js';

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}));

const PAGE_URL = 'https://seller.shopee.co.id/awbprint?batch=1';

function dependencies(
  extractDom: ScanDependencies['extractDom'],
): ScanDependencies {
  const unsupported: AdapterResult = {
    status: 'unsupported',
    labelsInspected: 0,
    rows: [],
    warnings: [],
  };

  return {
    extractDom,
    discoverPdf: vi.fn(() => ({ status: 'none' }) as const),
    fetchPdf: vi.fn(async () => new Uint8Array()),
    readPdf: vi.fn(async () => ({ pageCount: 0, pages: [], failures: [] })),
    extractPdf: vi.fn(() => unsupported),
  };
}

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;
type AddListener = (listener: MessageListener) => void;

function runtime(addListener: AddListener): ScanRuntime {
  return {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    onMessage: { addListener },
  };
}

describe('content runtime listener', () => {
  test('ignores malformed messages and sends one result for a scan request', async () => {
    const addListener = vi.fn<AddListener>();
    const sendResponse = vi.fn();
    const root = new JSDOM('<main></main>', { url: PAGE_URL }).window.document;
    const listenerRuntime = runtime(addListener);

    registerScanListener(
      listenerRuntime,
      () => PAGE_URL,
      () => root,
      dependencies(
        vi.fn(() => ({
          status: 'unsupported' as const,
          labelsInspected: 0,
          rows: [],
          warnings: [],
        })),
      ),
    );

    const listener = addListener.mock.calls[0]?.[0];
    if (listener === undefined) {
      throw new Error('listener was not registered');
    }

    expect(
      listener({ type: 'SCAN_REQUEST', extra: true }, {}, sendResponse),
    ).toBe(false);
    expect(listener({ type: 'SCAN_REQUEST' }, {}, sendResponse)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(sendResponse.mock.calls[0]?.[0]).toMatchObject({
      type: 'SCAN_RESULT',
      result: { status: 'unsupported' },
    });
  });

  test('converts unexpected scan failures to a generic inaccessible response', async () => {
    const addListener = vi.fn<AddListener>();
    const sendResponse = vi.fn();
    const root = new JSDOM('<main></main>', { url: PAGE_URL }).window.document;

    registerScanListener(
      runtime(addListener),
      () => PAGE_URL,
      () => root,
      dependencies(
        vi.fn(() => {
          throw new Error('private page details');
        }),
      ),
    );

    const listener = addListener.mock.calls[0]?.[0];
    if (listener === undefined) {
      throw new Error('listener was not registered');
    }
    listener({ type: 'SCAN_REQUEST' }, {}, sendResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledTimes(1);
    const response = JSON.stringify(sendResponse.mock.calls[0]?.[0]);
    expect(response).toContain('INACCESSIBLE_SOURCE');
    expect(response).not.toContain('private page details');
  });

  test.each([
    [
      'page URL',
      (): string => {
        throw new Error('private page URL');
      },
      (): Document => rootDocument(),
    ],
    [
      'root document',
      (): string => PAGE_URL,
      (): Document => {
        throw new Error('private root document');
      },
    ],
  ] as const)(
    'returns one sanitized inaccessible response when the %s accessor throws',
    async (_name, getPageUrl, getRootDocument) => {
      const addListener = vi.fn<AddListener>();
      const sendResponse = vi.fn();

      registerScanListener(
        runtime(addListener),
        getPageUrl,
        getRootDocument,
        dependencies(
          vi.fn(() => ({
            status: 'unsupported' as const,
            labelsInspected: 0,
            rows: [],
            warnings: [],
          })),
        ),
      );

      const listener = addListener.mock.calls[0]?.[0];
      if (listener === undefined) {
        throw new Error('listener was not registered');
      }

      expect(listener({ type: 'SCAN_REQUEST' }, {}, sendResponse)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledTimes(1);
      const response = JSON.stringify(sendResponse.mock.calls[0]?.[0]);
      expect(response).toContain('"status":"inaccessible"');
      expect(response).toContain('INACCESSIBLE_SOURCE');
      expect(response).not.toContain('private page');
    },
  );
});

function rootDocument(): Document {
  return new JSDOM('<main></main>', { url: PAGE_URL }).window.document;
}
