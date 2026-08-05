# Third-party notices

## PDF.js

- Project: PDF.js
- Upstream: https://github.com/mozilla/pdf.js
- Homepage: https://mozilla.github.io/pdf.js/
- Locked package: `pdfjs-dist@6.2.108`
- License: Apache License 2.0
- License source: `node_modules/pdfjs-dist/LICENSE`
- Packaged license: `dist/vendor/pdfjs-LICENSE`

This extension bundles the PDF.js legacy display API used by the content scan
path and the matching local worker used for PDF text-layer extraction:

- `pdfjs-dist/legacy/build/pdf.mjs`
- `pdfjs-dist/legacy/build/pdf.worker.min.mjs`

The build verifies that the installed API and worker come from the same locked
PDF.js version, copies the worker to `dist/vendor/pdf.worker.min.mjs`, and
copies the license to `dist/vendor/pdfjs-LICENSE`. No PDF bytes or extracted
label text are sent to PDF.js or any other external service.

The complete Apache License 2.0 text is included in the packaged license copy
and is distributed with the unpacked extension.
