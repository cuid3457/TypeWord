import { formatLocalPrice } from '../../src/utils/pure';

describe('formatLocalPrice', () => {
  it('formats USD with ceil rounding', () => {
    // Math.ceil(2.49 * 100) = 250 due to floating point → $2.50
    const result = formatLocalPrice(2.49, 'USD');
    expect(result).toMatch(/2[.,]50/);
  });

  it('formats exact USD amount', () => {
    const result = formatLocalPrice(3.00, 'USD');
    expect(result).toMatch(/3[.,]00/);
  });

  it('formats KRW with no decimal places (zero-decimal currency)', () => {
    const result = formatLocalPrice(3900, 'KRW');
    expect(result).not.toContain('.');
    expect(result).toContain('3,900');
  });

  it('floors KRW to nearest 100', () => {
    const result = formatLocalPrice(3900.1, 'KRW');
    expect(result).toContain('3,900');
  });

  it('formats JPY with no decimal places', () => {
    const result = formatLocalPrice(499, 'JPY');
    expect(result).not.toContain('.');
  });

  it('rounds USD up from fractional cents', () => {
    const result = formatLocalPrice(2.991, 'USD');
    expect(result).toMatch(/3[.,]00/);
  });

  it('handles VND (zero-decimal)', () => {
    const result = formatLocalPrice(89000, 'VND');
    expect(result).not.toContain('.');
  });

  it('falls back to dollar format on invalid currency', () => {
    const result = formatLocalPrice(9.99, 'INVALID_CURRENCY_CODE_THAT_WILL_NEVER_EXIST');
    expect(result).toContain('9.99');
  });

  it('handles IDR (zero-decimal)', () => {
    const result = formatLocalPrice(79000, 'IDR');
    expect(result).not.toContain('.');
  });
});
