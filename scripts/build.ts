import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const ROOT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST_DIR = resolve(ROOT_DIR, 'dist');
const EXPECTED_PDFJS_VERSION = '6.2.108';

interface PackageManifest {
  dependencies?: Record<string, string>;
  version?: string;
}

function rootPath(...segments: string[]): string {
  return resolve(ROOT_DIR, ...segments);
}

async function requireFile(path: string): Promise<void> {
  const details = await stat(path).catch(() => null);
  if (details === null || !details.isFile()) {
    throw new Error(`Required build input is missing: ${path}`);
  }
}

async function readJson(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, 'utf8')) as PackageManifest;
}

async function assertPdfJsVersion(): Promise<void> {
  const rootPackage = await readJson(rootPath('package.json'));
  const installedPackage = await readJson(
    rootPath('node_modules', 'pdfjs-dist', 'package.json'),
  );
  if (
    rootPackage.dependencies?.['pdfjs-dist'] !== EXPECTED_PDFJS_VERSION ||
    installedPackage.version !== EXPECTED_PDFJS_VERSION
  ) {
    throw new Error('The locked PDF.js package version is not available.');
  }
}

async function preflight(): Promise<void> {
  await Promise.all([
    requireFile(rootPath('src', 'manifest.json')),
    requireFile(rootPath('src', 'content', 'index.ts')),
    requireFile(rootPath('src', 'popup', 'index.ts')),
    requireFile(rootPath('src', 'popup', 'popup.html')),
    requireFile(rootPath('src', 'popup', 'popup.css')),
    requireFile(rootPath('src', 'local-pdf', 'index.ts')),
    requireFile(rootPath('src', 'local-pdf', 'local-pdf.html')),
    requireFile(rootPath('src', 'local-pdf', 'local-pdf.css')),
    requireFile(
      rootPath(
        'node_modules',
        'pdfjs-dist',
        'legacy',
        'build',
        'pdf.worker.min.mjs',
      ),
    ),
    requireFile(rootPath('node_modules', 'pdfjs-dist', 'LICENSE')),
  ]);
  await assertPdfJsVersion();
}

async function bundle(entryPoint: string, outputFile: string): Promise<void> {
  await build({
    entryPoints: [rootPath(entryPoint)],
    outfile: rootPath(outputFile),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome125',
    sourcemap: false,
    legalComments: 'none',
  });
}

async function copyInput(source: string, destination: string): Promise<void> {
  await mkdir(dirname(rootPath(destination)), { recursive: true });
  await copyFile(rootPath(source), rootPath(destination));
}

export async function buildExtension(): Promise<void> {
  await preflight();
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  await bundle('src/content/index.ts', 'dist/content.js');
  await bundle('src/popup/index.ts', 'dist/popup/popup.js');
  await bundle('src/local-pdf/index.ts', 'dist/local-pdf/local-pdf.js');

  await Promise.all([
    copyInput('src/manifest.json', 'dist/manifest.json'),
    copyInput('src/popup/popup.html', 'dist/popup/popup.html'),
    copyInput('src/popup/popup.css', 'dist/popup/popup.css'),
    copyInput('src/local-pdf/local-pdf.html', 'dist/local-pdf/local-pdf.html'),
    copyInput('src/local-pdf/local-pdf.css', 'dist/local-pdf/local-pdf.css'),
    copyInput(
      'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      'dist/vendor/pdf.worker.min.mjs',
    ),
    copyInput('node_modules/pdfjs-dist/LICENSE', 'dist/vendor/pdfjs-LICENSE'),
  ]);
}

await buildExtension();
