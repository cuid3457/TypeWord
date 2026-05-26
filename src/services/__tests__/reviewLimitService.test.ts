let store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  },
}));

let mockTier: 'free' | 'plus' | 'pro' = 'free';
jest.mock('../subscriptionService', () => ({
  isPremium: () => mockTier !== 'free',
  getTier: () => mockTier,
}));

import {
  getDailyLimit,
  getRemaining,
  consumeWord,
  canWatchRewardedAd,
  recordRewardedAdWatch,
  REWARDED_AD_BONUS_CARDS,
} from '../reviewLimitService';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seedState(overrides: { date?: string; used?: number; bonusEarned?: number } = {}) {
  const state = {
    date: overrides.date ?? todayKey(),
    used: overrides.used ?? 0,
    bonusEarned: overrides.bonusEarned ?? 0,
  };
  store['typeword.reviewLimits'] = JSON.stringify(state);
}

beforeEach(() => {
  store = {};
  mockTier = 'free';
});

describe('getDailyLimit', () => {
  it('returns 100 for free tier', () => {
    expect(getDailyLimit('free')).toBe(100);
  });

  it('returns Infinity for pro tier', () => {
    expect(getDailyLimit('pro')).toBe(Infinity);
  });

  it('uses current tier when called with no argument', () => {
    mockTier = 'pro';
    expect(getDailyLimit()).toBe(500);
  });
});

describe('getRemaining', () => {
  it('returns Infinity for pro users', async () => {
    mockTier = 'pro';
    expect(await getRemaining()).toBe(Infinity);
  });

  it('returns full free limit when nothing consumed', async () => {
    expect(await getRemaining()).toBe(100);
  });

  it('returns full plus limit when nothing consumed', async () => {
    mockTier = 'pro';
    expect(await getRemaining()).toBe(500);
  });

  it('decrements based on used', async () => {
    seedState({ used: 50 });
    expect(await getRemaining()).toBe(50);
  });

  it('returns 0 when limit exhausted', async () => {
    seedState({ used: 100 });
    expect(await getRemaining()).toBe(0);
  });

  it('includes ad-earned bonus in remaining', async () => {
    seedState({ used: 100, bonusEarned: 100 });
    expect(await getRemaining()).toBe(100);
  });

  it('migrates legacy per-mode used record into unified count', async () => {
    store['typeword.reviewLimits'] = JSON.stringify({
      date: todayKey(),
      used: { flashcard: 30, choice: 20, dictation: 10 },
      adsWatched: 0,
    });
    expect(await getRemaining()).toBe(100 - 60);
  });
});

describe('consumeWord', () => {
  it('allows consumption when within limit', async () => {
    const result = await consumeWord();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
  });

  it('decrements on successive calls', async () => {
    await consumeWord();
    const result = await consumeWord();
    expect(result.remaining).toBe(98);
  });

  it('blocks consumption when limit exhausted', async () => {
    seedState({ used: 100 });
    const result = await consumeWord();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('pro users are always allowed with Infinity remaining', async () => {
    mockTier = 'pro';
    const result = await consumeWord();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });

  it('plus users get 500 limit', async () => {
    mockTier = 'pro';
    seedState({ used: 499 });
    const result = await consumeWord();
    expect(result.allowed).toBe(true);
    const blocked = await consumeWord();
    expect(blocked.allowed).toBe(false);
  });

  it('mode argument is ignored (unified counter)', async () => {
    await consumeWord('dictation');
    await consumeWord('context');
    const result = await consumeWord('flashcard');
    expect(result.remaining).toBe(97);
  });
});

describe('rewarded ads', () => {
  it('free user can always watch (unlimited per day)', async () => {
    expect(await canWatchRewardedAd()).toBe(true);
    seedState({ bonusEarned: 500 });
    expect(await canWatchRewardedAd()).toBe(true);
  });

  it('paid users cannot watch ads', async () => {
    mockTier = 'pro';
    expect(await canWatchRewardedAd()).toBe(false);
    mockTier = 'pro';
    expect(await canWatchRewardedAd()).toBe(false);
  });

  it('each watch grants +REWARDED_AD_BONUS_CARDS', async () => {
    seedState({ used: 100 });
    expect(await getRemaining()).toBe(0);
    await recordRewardedAdWatch();
    expect(await getRemaining()).toBe(REWARDED_AD_BONUS_CARDS);
  });

  it('multiple watches stack', async () => {
    seedState({ used: 100 });
    await recordRewardedAdWatch();
    await recordRewardedAdWatch();
    expect(await getRemaining()).toBe(REWARDED_AD_BONUS_CARDS * 2);
  });
});

describe('day boundary reset', () => {
  it('returns fresh state when stored date is yesterday', async () => {
    seedState({ date: '2020-01-01', used: 200, bonusEarned: 500 });
    expect(await getRemaining()).toBe(100);
  });

  it('resets bonus on new day', async () => {
    seedState({ date: '2020-01-01', bonusEarned: 300 });
    seedState({ date: '2020-01-01', used: 0, bonusEarned: 300 });
    // After day rollover, bonus should be cleared
    const result = await consumeWord();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(199);
  });
});
