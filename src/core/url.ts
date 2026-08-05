const SUPPORTED_ORIGIN = 'https://seller.shopee.co.id';

export function isSupportedAwbUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const authority = value.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/iu)?.[1];
    if (authority?.toLowerCase() !== 'seller.shopee.co.id') {
      return false;
    }

    return (
      url.protocol === 'https:' &&
      url.origin === SUPPORTED_ORIGIN &&
      url.hostname === 'seller.shopee.co.id' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/awbprint' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}
