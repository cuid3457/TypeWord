import { formatLocalPrice } from '../pure';

describe('formatLocalPrice', () => {
  describe('zero-decimal currencies', () => {
    it('KRW floors to nearest 100', () => {
      const result = formatLocalPrice(3667, 'KRW');
      expect(result).toMatch(/3,600/);
      expect(result).not.toMatch(/\./);
    });

    it('KRW floors 3699 to 3600', () => {
      const result = formatLocalPrice(3699, 'KRW');
      expect(result).toMatch(/3,600/);
    });

    it('KRW keeps exact hundreds unchanged', () => {
      const result = formatLocalPrice(3600, 'KRW');
      expect(result).toMatch(/3,600/);
    });

    it('JPY floors to nearest 100', () => {
      const result = formatLocalPrice(550, 'JPY');
      expect(result).toMatch(/500/);
      expect(result).not.toMatch(/\./);
    });

    it('JPY floors 199 to 100', () => {
      const result = formatLocalPrice(199, 'JPY');
      expect(result).toMatch(/100/);
    });
  });

  describe('decimal currencies', () => {
    it('USD rounds up to 2 decimal places', () => {
      const result = formatLocalPrice(4.991, 'USD');
      expect(result).toMatch(/5\.00/);
    });

    it('USD preserves 2 decimal places', () => {
      const result = formatLocalPrice(9.99, 'USD');
      expect(result).toMatch(/9\.99/);
    });

    it('USD rounds 1.001 up to 1.01', () => {
      const result = formatLocalPrice(1.001, 'USD');
      expect(result).toMatch(/1\.01/);
    });

    it('USD handles whole numbers', () => {
      const result = formatLocalPrice(5, 'USD');
      expect(result).toMatch(/5\.00/);
    });
  });

  describe('fallback on invalid currency', () => {
    it('returns $amount format for invalid currency code', () => {
      const result = formatLocalPrice(9.99, 'INVALID');
      expect(result).toBe('$9.99');
    });

    it('returns $amount with 2 decimal places on fallback', () => {
      const result = formatLocalPrice(10, 'ZZZZZ');
      expect(result).toBe('$10.00');
    });
  });
});
