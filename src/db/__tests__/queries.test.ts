import { isExpression } from '../../utils/pure';

describe('isExpression', () => {
  it('detects simple math expressions', () => {
    expect(isExpression('1+2')).toBe(true);
    expect(isExpression('3 * 4')).toBe(true);
    expect(isExpression('10 / 2')).toBe(true);
    expect(isExpression('5 - 3')).toBe(true);
  });

  it('detects complex expressions', () => {
    expect(isExpression('(1+2)*3')).toBe(true);
    expect(isExpression('2^10')).toBe(true);
    expect(isExpression('10 % 3')).toBe(true);
    expect(isExpression('5 != 3')).toBe(true);
    expect(isExpression('5 < 10')).toBe(true);
    expect(isExpression('10 > 5')).toBe(true);
    expect(isExpression('3 = 3')).toBe(true);
  });

  it('detects plain numbers', () => {
    expect(isExpression('42')).toBe(true);
    expect(isExpression('0')).toBe(true);
    expect(isExpression('123456')).toBe(true);
  });

  it('rejects words', () => {
    expect(isExpression('hello')).toBe(false);
    expect(isExpression('ephemeral')).toBe(false);
    expect(isExpression('café')).toBe(false);
  });

  it('rejects mixed word-number strings', () => {
    expect(isExpression('abc123')).toBe(false);
    expect(isExpression('3x + 2')).toBe(false);
    expect(isExpression('log2')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isExpression('')).toBe(false);
  });
});
