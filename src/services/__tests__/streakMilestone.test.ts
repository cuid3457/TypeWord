import { isMilestone, getDailyEmoji, getDailyVariant } from '../streakMilestone';

jest.mock('react-native', () => ({ DeviceEventEmitter: { emit: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({}));

describe('isMilestone', () => {
  it('returns false for 0', () => {
    expect(isMilestone(0)).toBe(false);
  });

  it('returns false for non-multiples of 10', () => {
    expect(isMilestone(1)).toBe(false);
    expect(isMilestone(5)).toBe(false);
    expect(isMilestone(9)).toBe(false);
    expect(isMilestone(11)).toBe(false);
    expect(isMilestone(25)).toBe(false);
  });

  it('returns true for multiples of 10', () => {
    expect(isMilestone(10)).toBe(true);
    expect(isMilestone(20)).toBe(true);
    expect(isMilestone(30)).toBe(true);
    expect(isMilestone(100)).toBe(true);
  });

  it('returns false for negative numbers', () => {
    expect(isMilestone(-10)).toBe(false);
  });
});

describe('getDailyEmoji', () => {
  it('returns correct emojis for valid variants', () => {
    expect(getDailyEmoji(0)).toBe('✨');
    expect(getDailyEmoji(1)).toBe('💪');
    expect(getDailyEmoji(2)).toBe('🎯');
  });

  it('falls back to ✨ for out-of-range', () => {
    expect(getDailyEmoji(3)).toBe('✨');
    expect(getDailyEmoji(-1)).toBe('✨');
    expect(getDailyEmoji(99)).toBe('✨');
  });
});

describe('getDailyVariant', () => {
  it('returns 0, 1, or 2 for consecutive days', () => {
    const v1 = getDailyVariant('2026-04-20');
    const v2 = getDailyVariant('2026-04-21');
    const v3 = getDailyVariant('2026-04-22');
    expect([0, 1, 2]).toContain(v1);
    expect([0, 1, 2]).toContain(v2);
    expect([0, 1, 2]).toContain(v3);
  });

  it('cycles through all 3 variants over 3 consecutive days', () => {
    const variants = new Set<number>();
    for (let d = 1; d <= 3; d++) {
      variants.add(getDailyVariant(`2026-01-0${d}`));
    }
    expect(variants.size).toBe(3);
  });

  it('returns same variant for same date', () => {
    expect(getDailyVariant('2026-06-15')).toBe(getDailyVariant('2026-06-15'));
  });
});
