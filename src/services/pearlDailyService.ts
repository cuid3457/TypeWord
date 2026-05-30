/**
 * Word Pearl daily-completion tracking. One pearl batch per day — finishing
 * a batch hides the dashboard card until tomorrow so the feature stays scarce
 * (and thus valuable) instead of degrading into a bottomless to-do list.
 *
 * Day boundary mirrors streakService (4 AM local) so a late-night batch
 * doesn't unlock the next day's at 12:01 AM.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'pearl_last_completed_date';
const DAY_BOUNDARY_HOUR = 0; // matches streakService — adjust together if changed

function todayKey(): string {
  const d = new Date(Date.now() - DAY_BOUNDARY_HOUR * 3600_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function markPearlCompletedToday(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, todayKey());
  } catch { /* silent — best effort */ }
}

export async function isPearlCompletedToday(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return stored === todayKey();
  } catch {
    return false;
  }
}
