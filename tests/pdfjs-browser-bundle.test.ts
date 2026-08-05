import { describe, expect, test } from 'vitest';
import { build } from 'esbuild';

describe('PDF.js browser bundle compatibility', () => {
  test('bundles the legacy PDF.js API for Chrome 125 without emitting native artifacts', async () => {
    const result = await build({
      stdin: {
        contents:
          "import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';\nvoid getDocument;",
        resolveDir: process.cwd(),
        sourcefile: 'pdfjs-smoke-entry.ts',
        loader: 'ts',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      target: 'chrome125',
      outfile: 'pdfjs-smoke.js',
      metafile: true,
      logLevel: 'silent',
    });

    expect(result.outputFiles).toHaveLength(1);
    expect(result.outputFiles[0]?.path.endsWith('.js')).toBe(true);
    expect(result.outputFiles[0]?.text).toContain('getDocument');
    expect(Object.keys(result.metafile?.outputs ?? {})).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.node$/u)]),
    );
  });
});
