import { stripBookName, getDailyContent, getReengagementContent, type NotificationTranslations } from '../notificationService';

jest.mock('../streakService', () => ({}));
jest.mock('@src/db/queries', () => ({}));
jest.mock('../sentry', () => ({ captureError: jest.fn() }));

const mockTranslations: NotificationTranslations = {
  reviewTitle: '✏️ Time to review!',
  reviewBody: "'{{bookName}}': {{count}} words waiting for review",
  addTitle: "✏️ Grow your '{{bookName}}' list!",
  addBody: 'Add new words and start today\'s study session',
  streakSuffix: '({{count}}-day🔥)',
  return7dTitle: '📖 A week without review',
  return7dBody: 'Just 3 minutes of review can make a big difference!',
  return10dTitle: "📖 It's been 10 days",
  return10dBody: 'A quick review keeps your memory sharp.',
  return14dTitle: '👋 Still there?',
  return14dBody: '{{count}} words are waiting for review.',
  weeklyTitle: '📊 Weekly progress',
  weeklyBody: 'You studied {{count}} words this week. Keep it up!',
  perListTitle: '🔔 {{title}}',
  perListBodyDue: '{{count}} words are waiting for review',
  perListBodyDue2: "Start with today's {{count}} words?",
  perListBodyDueStreak: 'Review {{count}} to keep your {{streak}}-day streak 🔥',
  perListBodyEmpty: 'How about adding new words today?',
  perListBodyEmpty2: 'Add one more word to this list?',
  perListBodyEmptyStreak: '{{streak}}-day streak going! A quick session today 🔥',
};

describe('stripBookName', () => {
  it('removes {{bookName}} placeholder', () => {
    expect(stripBookName("Grow your '{{bookName}}' list!")).not.toContain('{{bookName}}');
  });

  it('normalizes extra whitespace', () => {
    const result = stripBookName("'{{bookName}}': 5 words waiting");
    expect(result).not.toContain('  ');
  });

  it('handles string without bookName', () => {
    expect(stripBookName('Hello world')).toBe('Hello world');
  });
});

describe('getDailyContent', () => {
  it('returns title and body strings', () => {
    const result = getDailyContent(mockTranslations, 10, 5, 'The Alchemist');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('body');
    expect(typeof result.title).toBe('string');
    expect(typeof result.body).toBe('string');
  });

  it('includes streak suffix when streak > 0', () => {
    const results: string[] = [];
    for (let i = 0; i < 20; i++) {
      results.push(getDailyContent(mockTranslations, 10, 7, 'Book').body);
    }
    const hasStreak = results.some((b) => b.includes('7-day🔥'));
    expect(hasStreak).toBe(true);
  });

  it('does not include streak suffix when streak is 0', () => {
    const results: string[] = [];
    for (let i = 0; i < 20; i++) {
      results.push(getDailyContent(mockTranslations, 10, 0, 'Book').body);
    }
    const hasStreak = results.some((b) => b.includes('🔥'));
    expect(hasStreak).toBe(false);
  });

  it('substitutes bookName when provided', () => {
    const results: string[] = [];
    for (let i = 0; i < 30; i++) {
      const r = getDailyContent(mockTranslations, 5, 0, 'MyBook');
      results.push(r.title + ' ' + r.body);
    }
    const hasBook = results.some((s) => s.includes('MyBook'));
    expect(hasBook).toBe(true);
  });

  it('works without bookName', () => {
    const result = getDailyContent(mockTranslations, 5, 0, null);
    expect(result.title).not.toContain('{{bookName}}');
    expect(result.body).not.toContain('{{bookName}}');
  });

  it('substitutes count in review body', () => {
    const results: string[] = [];
    for (let i = 0; i < 20; i++) {
      results.push(getDailyContent(mockTranslations, 42, 0, 'Book').body);
    }
    const hasCount = results.some((b) => b.includes('42'));
    expect(hasCount).toBe(true);
  });
});

describe('getReengagementContent', () => {
  it('returns 7-day message for days <= 7', () => {
    const result = getReengagementContent(mockTranslations, 7, 10);
    expect(result.title).toBe(mockTranslations.return7dTitle);
    expect(result.body).toBe(mockTranslations.return7dBody);
  });

  it('returns 10-day message for days 8-10', () => {
    const result = getReengagementContent(mockTranslations, 10, 10);
    expect(result.title).toBe(mockTranslations.return10dTitle);
  });

  it('returns 14-day message for days > 10', () => {
    const result = getReengagementContent(mockTranslations, 14, 25);
    expect(result.title).toBe(mockTranslations.return14dTitle);
    expect(result.body).toContain('25');
  });

  it('returns 14-day message for very long absence', () => {
    const result = getReengagementContent(mockTranslations, 81, 50);
    expect(result.title).toBe(mockTranslations.return14dTitle);
    expect(result.body).toContain('50');
  });
});
