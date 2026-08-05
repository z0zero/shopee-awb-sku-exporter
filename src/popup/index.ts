import { createPopupController } from './controller.js';
import type { PopupPorts } from './controller.js';
import type { ScanResponse } from '../shared/messages.js';
import { scanResultElementIds } from '../ui/scan-result.js';

export function createPopupPorts(): PopupPorts {
  return {
    getActiveTab: async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      return tab === undefined || tab.id === undefined
        ? null
        : { id: tab.id, url: tab.url };
    },
    requestScan: (tabId) =>
      chrome.tabs.sendMessage(tabId, {
        type: 'SCAN_REQUEST',
      }) as Promise<ScanResponse>,
    openLocalPdfPage: async () => {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('local-pdf/local-pdf.html'),
      });
    },
    download: (options) => chrome.downloads.download(options),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    now: () => new Date(),
  };
}

function main(): void {
  const controller = createPopupController(document, createPopupPorts());
  document
    .getElementById('scan-button')
    ?.addEventListener('click', () => void controller.scan());
  document
    .getElementById('choose-pdf-button')
    ?.addEventListener('click', () => void controller.openLocalPdfPage());
  document
    .getElementById(scanResultElementIds.acknowledgement)
    ?.addEventListener('change', (event) => {
      const input = event.currentTarget;
      if (input instanceof HTMLInputElement) {
        controller.acknowledgePartial(input.checked);
      }
    });
  document
    .getElementById(scanResultElementIds.download)
    ?.addEventListener('click', () => void controller.download());
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  main();
}
