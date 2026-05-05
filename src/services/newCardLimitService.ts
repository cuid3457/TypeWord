/**
 * Per-day cap on how many *brand-new* words enter the learning queue.
 *
 * Why this used to exist: when a user adds 50 words at once, they all start
 * at learning step 0 with intervalDays=0 (due immediately). Without pacing,
 * the forgetting curve collapses — every card is at the same state.
 *
 * Why it's now uncapped: the cap conflicted with the user-set session size
 * ("session=20 but only 10 cards appear" felt like a bug). Pacing is now
 * handled by the SM-2 jitter in calculateNextReview, which spreads card
 * due-times so a bulk import doesn't all come back on the same day. The
 * counter is still incremented for analytics / future tuning.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'typeword.newCardsToday';

const NEW_CARDS_PER_DAY = Number.POSITIVE_INFINITY;

interface DailyState {
  date: string;
  count: number;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getNewCardDailyLimit(): number {
  // Returns Infinity — kept as a function in case the cap is reintroduced
  // (or tiered) later without touching call sites.
  return NEW_CARDS_PER_DAY;
}

async function loadState(): Promise<DailyState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DailyState;
      if (parsed.date === todayKey()) return parsed;
    } catch { /* fall through */ }
  }
  return { date: todayKey(), count: 0 };
}

export async function getNewCardsIntroducedToday(): Promise<number> {
  return (await loadState()).count;
}

export async function getNewCardsRemainingToday(): Promise<number> {
  const used = await getNewCardsIntroducedToday();
  return Math.max(0, getNewCardDailyLimit() - used);
}

export async function recordNewCardIntroduced(): Promise<void> {
  const state = await loadState();
  state.count += 1;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
