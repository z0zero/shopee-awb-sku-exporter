import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

interface Manifest {
  manifest_version: number;
  name: string;
  description: string;
  version: string;
  minimum_chrome_version: string;
  permissions: string[];
  host_permissions: string[];
  action: { default_popup: string };
  content_scripts: Array<{
    matches: string[];
    js: string[];
    run_at: string;
  }>;
  web_accessible_resources: Array<{
    resources: string[];
    matches: string[];
  }>;
}

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_MANIFEST = join(ROOT_DIR, 'src', 'manifest.json');
const DIST_DIR = join(ROOT_DIR, 'dist');

async function readManifest(path: string): Promise<Manifest> {
  return JSON.parse(await readFile(path, 'utf8')) as Manifest;
}

async function fileExists(path: string): Promise<boolean> {
  const details = await stat(path).catch(() => null);
  return details?.isFile() === true;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function manifestPolicy(manifest: Manifest): object {
  return {
    manifest_version: manifest.manifest_version,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    minimum_chrome_version: manifest.minimum_chrome_version,
    permissions: manifest.permissions,
    host_permissions: manifest.host_permissions,
    action: manifest.action,
    content_scripts: manifest.content_scripts,
    web_accessible_resources: manifest.web_accessible_resources,
  };
}

describe('built extension package', () => {
  test('contains every local manifest asset and preserves source policy', async () => {
    const sourceManifest = await readManifest(SOURCE_MANIFEST);
    const builtManifest = await readManifest(join(DIST_DIR, 'manifest.json'));

    expect(manifestPolicy(builtManifest)).toEqual(
      manifestPolicy(sourceManifest),
    );

    const references = [
      builtManifest.action.default_popup,
      ...builtManifest.content_scripts.flatMap((script) => script.js),
      ...builtManifest.web_accessible_resources.flatMap(
        (resource) => resource.resources,
      ),
    ];
    for (const reference of references) {
      expect(await fileExists(join(DIST_DIR, reference))).toBe(true);
    }

    const popupHtml = await readFile(
      join(DIST_DIR, builtManifest.action.default_popup),
      'utf8',
    );
    expect(await fileExists(join(DIST_DIR, 'popup', 'popup.js'))).toBe(true);
    expect(popupHtml).toMatch(/<script\s+src=["']popup\.js["']\s+defer>/);
    expect(popupHtml).not.toMatch(/(?:src|href)=["']https?:\/\//i);
    expect(await fileExists(join(DIST_DIR, 'popup', 'popup.css'))).toBe(true);
    expect(await fileExists(join(DIST_DIR, 'local-pdf', 'local-pdf.js'))).toBe(
      true,
    );
    expect(await fileExists(join(DIST_DIR, 'local-pdf', 'local-pdf.html'))).toBe(
      true,
    );
    expect(await fileExists(join(DIST_DIR, 'local-pdf', 'local-pdf.css'))).toBe(
      true,
    );
    const localPdfHtml = await readFile(
      join(DIST_DIR, 'local-pdf', 'local-pdf.html'),
      'utf8',
    );
    expect(localPdfHtml).toMatch(
      /<link\s+rel=["']stylesheet["']\s+href=["']local-pdf\.css["']\s*\/>/i,
    );
    expect(localPdfHtml).toMatch(
      /<script\s+src=["']local-pdf\.js["']\s+defer><\/script>/i,
    );
    expect(localPdfHtml).toMatch(
      /<input\s+id=["']pdf-file["']\s+type=["']file["']\s+accept=["']application\/pdf,\.pdf["']\s*\/>/,
    );
    expect(localPdfHtml).not.toMatch(/<script[^>]*>[^<]+<\/script>/i);
    expect(localPdfHtml).not.toMatch(/(?:src|href)=["']https?:\/\//i);
    expect(await fileExists(join(DIST_DIR, 'vendor', 'pdfjs-LICENSE'))).toBe(
      true,
    );
  });

  test('does not package direct remote executable dependencies or native binaries', async () => {
    const bundlePaths = [
      join(DIST_DIR, 'content.js'),
      join(DIST_DIR, 'popup', 'popup.js'),
      join(DIST_DIR, 'local-pdf', 'local-pdf.js'),
    ];
    const bundles = await Promise.all(
      bundlePaths.map((path) => readFile(path, 'utf8')),
    );
    const bundleText = bundles.join('\n');

    expect(bundleText).not.toMatch(
      /(?:import|fetch|script\.src|workerSrc)\s*(?:\(|=)[^;\n]{0,200}https?:\/\//i,
    );
    expect(bundleText).not.toMatch(/<script\b[^>]+\bsrc=["']https?:\/\//i);

    const files = await listFiles(DIST_DIR);
    expect(files.filter((path) => path.endsWith('.node'))).toEqual([]);
    const builtManifest = await readManifest(join(DIST_DIR, 'manifest.json'));
    expect(JSON.stringify(builtManifest)).not.toContain('file://');
    expect(JSON.stringify(builtManifest)).not.toContain('<all_urls>');
  });
});
