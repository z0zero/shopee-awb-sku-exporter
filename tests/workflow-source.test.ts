import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

async function readBuildWorkflow(): Promise<string> {
  const workflow = await readFile(
    new URL('../.github/workflows/build.yml', import.meta.url),
    'utf8',
  );
  return workflow.replace(/\r\n/g, '\n');
}

describe('build workflow policy', () => {
  test('publishes the versioned ZIP to Release with job-scoped write access', async () => {
    const workflow = await readBuildWorkflow();

    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain(
      'outputs:\n      extension-version: ${{ steps.version.outputs.extension-version }}',
    );
    expect(workflow).toMatch(
      /publish:\n\s+needs: build\n\s+if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'\n\s+permissions:\n\s+contents: write/,
    );
    expect(workflow).toContain('actions/download-artifact@v4');
    expect(workflow).toContain('RELEASE_BRANCH: Release');
    expect(workflow).toContain(
      'EXTENSION_VERSION: ${{ needs.build.outputs.extension-version }}',
    );
    expect(workflow).toContain('shopee-awb-sku-exporter.zip');
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('createCommitOnBranch');
    expect(workflow).toContain('gh api graphql --input -');
    expect(workflow).toContain(
      'base64 -w 0 "$package_path" > "$encoded_package_path"',
    );
    expect(workflow).toContain('--rawfile contents "$encoded_package_path"');
    expect(workflow).not.toContain('--arg contents "$package_contents"');
    expect(workflow).toContain('build: publish v$EXTENSION_VERSION');
    expect(workflow).not.toContain('git commit -m');
    expect(workflow).not.toContain('secrets.PAT');
  });
});
