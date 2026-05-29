/**
 * Centralized haptic feedback. Every haptic in the app routes through here so
 * the "feel" stays consistent and platform quirks live in one place.
 *
 * Intentionally NOT gated by a user setting — like the iOS system haptic
 * switch, haptics either fire or they don't based on the OS. This mirrors the
 * SFX-vs-haptic split documented in sfxService.ts.
 *
 * Semantic API (intent, not primitive):
 *   selection() — light pick / toggle / navigation / playful poke
 *   tap()       — button press
 *   medium()    — committing/saving something of weight
 *   success()   — positive outcome (correct, purchase complete, milestone)
 *   warning()   — destructive confirmation
 *   error()     — failure
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// expo-haptics is a no-op (and noisy) on web; only fire on the two native OSes.
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(fn: () => Promise<unknown>): void {
  if (!supported) return;
  // A missed haptic must never crash the UI — swallow rejections.
  fn().catch(() => {});
}

function impact(style: Haptics.ImpactFeedbackStyle): void {
  safe(() => Haptics.impactAsync(style));
}

function notify(type: Haptics.NotificationFeedbackType): void {
  safe(() => Haptics.notificationAsync(type));
}

export const haptic = {
  selection(): void {
    // selectionAsync is crisp on iOS but maps to an inconsistent micro-tick on
    // Android — use a uniform Light impact there so both platforms feel alike.
    if (Platform.OS === 'android') impact(Haptics.ImpactFeedbackStyle.Light);
    else safe(() => Haptics.selectionAsync());
  },
  tap(): void {
    impact(Haptics.ImpactFeedbackStyle.Light);
  },
  medium(): void {
    impact(Haptics.ImpactFeedbackStyle.Medium);
  },
  success(): void {
    notify(Haptics.NotificationFeedbackType.Success);
  },
  warning(): void {
    notify(Haptics.NotificationFeedbackType.Warning);
  },
  error(): void {
    notify(Haptics.NotificationFeedbackType.Error);
  },
};
