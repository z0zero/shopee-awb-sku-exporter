import { describe, expect, test, vi } from 'vitest';

import { createPopupPorts } from './index.js';

describe('popup runtime wiring', () => {
  test('opens the local PDF route in a new tab', async () => {
    const getURL = vi.fn((path: string) => `chrome-extension://test/${path}`);
    const create = vi.fn(async () => ({ id: 1 }));
    vi.stubGlobal('chrome', {
      runtime: { getURL },
      tabs: { create },
    });

    try {
      await createPopupPorts().openLocalPdfPage();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(getURL).toHaveBeenCalledWith('local-pdf/local-pdf.html');
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/local-pdf/local-pdf.html',
    });
  });
});
