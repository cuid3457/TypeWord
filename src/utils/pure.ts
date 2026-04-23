const EXPR_RE = /^[\d\s+\-*/^!=<>().%]+$/;

export function isExpression(word: string): boolean {
  return EXPR_RE.test(word);
}

const ZERO_DECIMAL_CURRENCIES = new Set(['KRW', 'JPY', 'VND', 'IDR', 'CLP']);

export function formatLocalPrice(amount: number, currencyCode: string): string {
  try {
    const noDecimals = ZERO_DECIMAL_CURRENCIES.has(currencyCode);
    const rounded = noDecimals ? Math.floor(amount / 100) * 100 : Math.ceil(amount * 100) / 100;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: noDecimals ? 0 : 2,
      maximumFractionDigits: noDecimals ? 0 : 2,
    }).format(rounded);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
