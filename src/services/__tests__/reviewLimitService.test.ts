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

let mockPremium = false;
jest.mock('../subscriptionService', () => ({
  isPremium: () => mockPremium,
}));

import {
  getDailyLimit,
  getRemaining,
  getRemainingAll,
  consumeWord,
  canWatchRewardedAd,
  recordRewardedAdWatch,
  type ReviewMode,
} from '../reviewLimitService';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function seedState(overrides: {
  date?: string;
  used?: Partial<Record<ReviewMode, number>>;
  adsWatched?: number;
} = {}) {
  const state = {
    date: overrides.date ?? todayKey(),
    used: {
      flashcard: 0,
      choice: 0,
      dictation: 0,
      context: 0,
      ...overrides.used,
    },
    adsWatched: overrides.adsWatched ?? 0,
  };
  store['typeword.reviewLimits'] = JSON.stringify(state);
}

beforeEach(() => {
  store = {};
  mockPremium = false;
});

describe('getDailyLimit', () => {
  it('returns 50 for flashcard mode', () => {
    expect(getDailyLimit('flashcard')).toBe(50);
  });

  it('returns 50 for choice mode', () => {
    expect(getDailyLimit('choice')).toBe(50);
  });

  it('returns 30 for dictation mode', () => {
    expect(getDailyLimit('dictation')).toBe(30);
  });

  it('returns 30 for context mode', () => {
    expect(getDailyLimit('context')).toBe(30);
  });

  const modes: ReviewMode[] = ['flashcard', 'choice', 'dictation', 'context'];
  it('returns a positive number for all modes', () => {
    for (const mode of modes) {
      expect(getDailyLimit(mode)).toBeGreaterThan(0);
    }
  });
});

describe('getRemaining', () => {
  it('returns Infinity for premium users', async () => {
    mockPremium = true;
    const remaining = await getRemaining('flashcard');
    expect(remaining).toBe(Infinity);
  });

  it('returns full limit when no words consumed', async () => {
    const remaining = await getRemaining('flashcard');
    expect(remaining).toBe(50);
  });

  it('returns correct remaining after some usage', async () => {
    seedState({ used: { flashcard: 10 } });
    const remaining = await getRemaining('flashcard');
    expect(remaining).toBe(40);
  });

  it('returns 0 when limit exhausted', async () => {
    seedState({ used: { dictation: 30 } });
    const remaining = await getRemaining('dictation');
    expect(remaining).toBe(0);
  });

  it('returns 0 when usage exceeds limit', async () => {
    seedState({ used: { dictation: 35 } });
    const remaining = await getRemaining('dictation');
    expect(remaining).toBe(0);
  });
});

describe('getRemainingAll', () => {
  it('returns Infinity for all modes when premium', async () => {
    mockPremium = true;
    const result = await getRemainingAll();
    expect(result.flashcard).toBe(Infinity);
    expect(result.choice).toBe(Infinity);
    expect(result.dictation).toBe(Infinity);
    expect(result.context).toBe(Infinity);
  });

  it('returns full limits when nothing consumed', async () => {
    const result = await getRemainingAll();
    expect(result.flashcard).toBe(50);
    expect(result.choice).toBe(50);
    expect(result.dictation).toBe(30);
    expect(result.context).toBe(30);
  });

  it('returns correct remaining for partially consumed modes', async () => {
    seedState({ used: { flashcard: 20, dictation: 5 } });
    const result = await getRemainingAll();
    expect(result.flashcard).toBe(30);
    expect(result.choice).toBe(50);
    expect(result.dictation).toBe(25);
    expect(result.context).toBe(30);
  });
});

describe('consumeWord', () => {
  it('allows consumption when within limit', async () => {
    const result = await consumeWord('flashcard');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(49);
  });

  it('decrements remaining properly on successive calls', async () => {
    await consumeWord('flashcard');
    const result = await consumeWord('flashcard');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(48);
  });

  it('returns allowed: false when limit exhausted', async () => {
    seedState({ used: { flashcard: 50 } });
    const result = await consumeWord('flashcard');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('premium users are always allowed with Infinity remaining', async () => {
    mockPremium = true;
    const result = await consumeWord('flashcard');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });

  it('does not modify stored state for premium users', async () => {
    mockPremium = true;
    await consumeWord('flashcard');
    mockPremium = false;
    const remaining = await getRemaining('flashcard');
    expect(remaining).toBe(50);
  });

  it('tracks modes independently', async () => {
    seedState({ used: { flashcard: 50 } });
    const flashResult = await consumeWord('flashcard');
    const choiceResult = await consumeWord('choice');
    expect(flashResult.allowed).toBe(false);
    expect(choiceResult.allowed).toBe(true);
  });
});

describe('canWatchRewardedAd', () => {
  it('returns true when no ads watched today', async () => {
    const result = await canWatchRewardedAd();
    expect(result).toBe(true);
  });

  it('returns false after one ad watched', async () => {
    seedState({ adsWatched: 1 });
    const result = await canWatchRewardedAd();
    expect(result).toBe(false);
  });

  it('returns false for premium users', async () => {
    mockPremium = true;
    const result = await canWatchRewardedAd();
    expect(result).toBe(false);
  });
});

describe('recordRewardedAdWatch', () => {
  it('resets all usage counts', async () => {
    seedState({ used: { flashcard: 30, choice: 20, dictation: 15, context: 10 } });
    await recordRewardedAdWatch();
    const remaining = await getRemainingAll();
    expect(remaining.flashcard).toBe(50);
    expect(remaining.choice).toBe(50);
    expect(remaining.dictation).toBe(30);
    expect(remaining.context).toBe(30);
  });

  it('increments adsWatched', async () => {
    await recordRewardedAdWatch();
    const canWatch = await canWatchRewardedAd();
    expect(canWatch).toBe(false);
  });

  it('increments adsWatched from existing count', async () => {
    seedState({ adsWatched: 0, used: { flashcard: 50 } });
    await recordRewardedAdWatch();
    const canWatch = await canWatchRewardedAd();
    expect(canWatch).toBe(false);
  });
});

describe('day boundary reset', () => {
  it('returns fresh state when stored date is yesterday', async () => {
    seedState({ date: '2020-01-01', used: { flashcard: 50, choice: 50, dictation: 30, context: 30 }, adsWatched: 1 });
    const remaining = await getRemaining('flashcard');
    expect(remaining).toBe(50);
  });

  it('resets adsWatched on new day', async () => {
    seedState({ date: '2020-01-01', adsWatched: 1 });
    const canWatch = await canWatchRewardedAd();
    expect(canWatch).toBe(true);
  });

  it('allows consumption after day boundary', async () => {
    seedState({ date: '2020-01-01', used: { flashcard: 50 } });
    const result = await consumeWord('flashcard');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(49);
  });
});
