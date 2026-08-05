import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

interface Manifest {
  manifest_version?: unknown;
  name?: unknown;
  description?: unknown;
  version?: unknown;
  minimum_chrome_version?: unknown;
  permissions?: unknown;
  host_permissions?: unknown;
  action?: unknown;
  content_scripts?: unknown;
  web_accessible_resources?: unknown;
  background?: unknown;
  content_security_policy?: unknown;
}

async function readSourceManifest(): Promise<Manifest> {
  const source = await readFile(
    new URL('../src/manifest.json', import.meta.url),
    'utf8',
  );
  return JSON.parse(source) as Manifest;
}

describe('source manifest policy', () => {
  test('declares the exact minimal MV3 extension boundary', async () => {
    const manifest = await readSourceManifest();

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Shopee AWB SKU Exporter');
    expect(manifest.description).toContain('SKU');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.minimum_chrome_version).toBe('125');
    expect(manifest.permissions).toEqual(['downloads']);
    expect(manifest.host_permissions).toEqual([
      'https://seller.shopee.co.id/*',
    ]);
    expect(manifest.action).toEqual({
      default_popup: 'popup/popup.html',
    });
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://seller.shopee.co.id/awbprint*'],
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ]);
    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ['vendor/pdf.worker.min.mjs'],
        matches: ['https://seller.shopee.co.id/*'],
      },
    ]);

    expect(manifest.background).toBeUndefined();
    expect(manifest.content_security_policy).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('file://');
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
  });
});
