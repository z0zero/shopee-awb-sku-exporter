import { JSDOM } from 'jsdom';

export function parseSyntheticDom(markup: string): ParentNode {
  return new JSDOM(markup).window.document;
}

export function completeLabelTablesMarkup(): string {
  return `
    <main>
      <table data-fixture="label-one">
        <thead>
          <tr>
            <th> SKU </th>
            <th> Qty </th>
            <th> Nama Produk </th>
            <th> Variasi </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>  000123-AB.C/7  </td>
            <td> 2 </td>
            <td><span>Synthetic</span> <span>Wrapped</span> Product</td>
            <td>Blue / Small</td>
          </tr>
          <tr>
            <td> SKU,WITH.PUNCT/02 </td>
            <td> 1 </td>
            <td> Demo Item </td>
            <td>Red-XL</td>
          </tr>
        </tbody>
      </table>

      <section>
        <p>Repeated layout whitespace is intentionally present.</p>
        <table data-fixture="label-two">
          <thead>
            <tr>
              <th>Nama    Produk</th>
              <th>Variasi</th>
              <th>Qty</th>
              <th>SKU</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Another
                Synthetic Product</td>
              <td>Standard</td>
              <td>3</td>
              <td>000123-AB.C/7</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  `;
}

export function roleTableMarkup(): string {
  return `
    <div role="table" aria-label="Synthetic label table">
      <div role="row">
        <span role="columnheader">SKU</span>
        <span role="columnheader">Qty</span>
        <span role="columnheader">Nama Produk</span>
        <span role="columnheader">Variasi</span>
      </div>
      <div role="row">
        <span role="cell">ROLE-TABLE-001</span>
        <span role="cell">4</span>
        <span role="cell">Synthetic Role Table Product</span>
        <span role="cell">One</span>
      </div>
    </div>
  `;
}

export function roleGridMarkup(): string {
  return `
    <div role="grid" aria-label="Synthetic label grid">
      <div role="row">
        <span role="columnheader">Nama Produk</span>
        <span role="columnheader">SKU</span>
        <span role="columnheader">Variasi</span>
        <span role="columnheader">Qty</span>
      </div>
      <div role="row">
        <span role="gridcell">Synthetic Grid Product</span>
        <span role="gridcell">GRID-SKU.02</span>
        <span role="gridcell">Two</span>
        <span role="gridcell">5</span>
      </div>
    </div>
  `;
}

export function rowLikeAriaFallbackMarkup(): string {
  return `
    <div role="table" aria-label="Synthetic row-like label table">
      <div role="row">
        <span role="cell">SKU</span>
        <span role="cell">ARIA-FALLBACK-01</span>
        <span role="cell">Qty</span>
        <span role="cell">6</span>
        <span role="cell">Nama Produk</span>
        <span role="cell">Synthetic Fallback Product</span>
      </div>
    </div>
  `;
}

export function partialMalformedRowsMarkup(): string {
  return `
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Qty</th>
          <th>Nama Produk</th>
          <th>Variasi</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>VALID-SKU-01</td>
          <td>2</td>
          <td>Valid Synthetic Product</td>
          <td>OK</td>
        </tr>
        <tr>
          <td> </td>
          <td>1</td>
          <td>Missing SKU Synthetic Product</td>
          <td>Rejected</td>
        </tr>
        <tr>
          <td>ZERO-QTY-SKU</td>
          <td>0</td>
          <td>Zero Qty Synthetic Product</td>
          <td>Rejected</td>
        </tr>
        <tr>
          <td>NEGATIVE-QTY-SKU</td>
          <td>-1</td>
          <td>Negative Qty Synthetic Product</td>
          <td>Rejected</td>
        </tr>
        <tr>
          <td>DECIMAL-QTY-SKU</td>
          <td>1.5</td>
          <td>Decimal Qty Synthetic Product</td>
          <td>Rejected</td>
        </tr>
      </tbody>
    </table>
  `;
}

export function allInvalidRowsMarkup(): string {
  return `
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Qty</th>
          <th>Nama Produk</th>
          <th>Variasi</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> </td>
          <td>1</td>
          <td>Missing SKU Synthetic Product</td>
          <td>Rejected</td>
        </tr>
        <tr>
          <td>INVALID-QTY-SKU</td>
          <td>0</td>
          <td>Invalid Qty Synthetic Product</td>
          <td>Rejected</td>
        </tr>
      </tbody>
    </table>
  `;
}

export function duplicateSkuAnchorMarkup(): string {
  return `
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>SKU</th>
          <th>Qty</th>
          <th>Nama Produk</th>
          <th>Variasi</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>FIRST-SKU</td>
          <td>SECOND-SKU</td>
          <td>1</td>
          <td>Duplicate SKU Anchor Product</td>
          <td>Rejected</td>
        </tr>
      </tbody>
    </table>
  `;
}

export function duplicateSkuCellFallbackMarkup(): string {
  return `
    <div role="table" aria-label="Synthetic duplicate SKU cells">
      <div role="row">
        <span role="cell">SKU</span>
        <span role="cell">FIRST-FALLBACK-SKU</span>
        <span role="cell">SKU</span>
        <span role="cell">SECOND-FALLBACK-SKU</span>
        <span role="cell">Qty</span>
        <span role="cell">1</span>
      </div>
    </div>
  `;
}

export function recognizedEmptyTableMarkup(): string {
  return `
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Qty</th>
          <th>Nama Produk</th>
          <th>Variasi</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;
}

export function missingAnchorsMarkup(): string {
  return `
    <table>
      <thead>
        <tr>
          <th>Nama Produk</th>
          <th>Variasi</th>
          <th>Qty</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Synthetic Missing Anchor Product</td>
          <td>Plain</td>
          <td>1</td>
        </tr>
      </tbody>
    </table>
  `;
}
