import { getStreakDate } from '../streakService';

jest.mock('@src/db', () => ({}));

describe('getStreakDate', () => {
  it('returns YYYY-MM-DD for a normal daytime timestamp', () => {
    // 2026-04-22 14:30 UTC
    const ts = new Date('2026-04-22T14:30:00Z').getTime();
    const result = getStreakDate(ts);
    expect(result).toBe('2026-04-22');
  });

  it('treats 3:59am as previous day (before 4am boundary)', () => {
    // 2026-04-22 03:59 local — should count as April 21
    const ts = new Date('2026-04-22T03:59:00').getTime();
    expect(getStreakDate(ts)).toBe('2026-04-21');
  });

  it('treats 4:00am as current day', () => {
    // 2026-04-22 04:00 local — should count as April 22
    const ts = new Date('2026-04-22T04:00:00').getTime();
    expect(getStreakDate(ts)).toBe('2026-04-22');
  });

  it('treats 4:01am as current day', () => {
    const ts = new Date('2026-04-22T04:01:00').getTime();
    expect(getStreakDate(ts)).toBe('2026-04-22');
  });

  it('handles midnight as previous day', () => {
    // 2026-04-22 00:00 local — before 4am, so still April 21
    const ts = new Date('2026-04-22T00:00:00').getTime();
    expect(getStreakDate(ts)).toBe('2026-04-21');
  });

  it('handles year boundary (Jan 1 at 2am → Dec 31)', () => {
    const ts = new Date('2027-01-01T02:00:00').getTime();
    expect(getStreakDate(ts)).toBe('2026-12-31');
  });

  it('pads month and day with zeros', () => {
    const ts = new Date('2026-01-05T12:00:00').getTime();
    expect(getStreakDate(ts)).toBe('2026-01-05');
  });
});
