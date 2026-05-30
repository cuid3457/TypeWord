/**
 * UI sound effects for review feedback.
 *
 * 5 events — correct / wrong / combo (5,10,20 milestone) / session complete /
 * level up — all share the same marimba family generated via ElevenLabs.
 *
 * Players are preloaded once at app boot so the first tap doesn't pay a
 * file-decode hit. seekTo(0) + play() gives "replay from start" so rapid
 * successive correct answers don't stack overlapping audio.
 *
 * iOS silent-switch is respected (no setAudioModeAsync override) — a user
 * studying in a quiet meeting shouldn't be betrayed by a marimba ding.
 */
import { Asset } from 'expo-asset';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { getUserSettings, subscribeUserSettings } from '@src/storage/userSettings';

const SFX_SOURCES = {
  correct: require('../../assets/sounds/correct.mp3'),
  wrong: require('../../assets/sounds/wrong.mp3'),
  combo: require('../../assets/sounds/combo.mp3'),
  'session-complete': require('../../assets/sounds/session-complete.mp3'),
  'level-up': require('../../assets/sounds/level-up.mp3'),
} as const;

export type SfxName = keyof typeof SFX_SOURCES;

const SFX_VOLUME = 0.7;

const players: Partial<Record<SfxName, AudioPlayer>> = {};
// null = not yet read; default to true when unread so SFX work on first ever
// play before settings have been touched (new install).
let enabled: boolean | null = null;
let preloaded = false;

/** Combo milestones that trigger the Combo SFX in place of Correct. */
export const COMBO_MILESTONES: readonly number[] = [5, 10, 20];

export function isComboMilestone(combo: number): boolean {
  return COMBO_MILESTONES.includes(combo);
}

/** Preload all SFX players. Call once during app boot from `_layout.tsx`. */
export async function preloadSfx(): Promise<void> {
  if (!preloaded) {
    // Resolve each require()'d asset to a local file uri before handing to
    // createAudioPlayer — iOS expo-audio is finicky with the raw require
    // number form (silent decode failures), uri form matches the TTS path
    // that we already know works on iOS.
    await Promise.all(
      (Object.keys(SFX_SOURCES) as SfxName[]).map(async (name) => {
        try {
          const asset = Asset.fromModule(SFX_SOURCES[name]);
          await asset.downloadAsync();
          const uri = asset.localUri ?? asset.uri;
          const p = createAudioPlayer({ uri });
          p.volume = SFX_VOLUME;
          players[name] = p;
        } catch {
          // Skip — playSfx will silently no-op for this name
        }
      }),
    );
    preloaded = true;
  }
  await refreshEnabled();
}

function computeEnabled(settings: { sfxEnabled?: boolean } | null): boolean {
  // SFX toggle in Settings tab is independent of the review modal's
  // "Auto-play sound" (which only controls per-card TTS auto-playback).
  // Haptic is never gated here — matches iOS silent-switch behavior.
  return settings?.sfxEnabled !== false;
}

async function refreshEnabled(): Promise<void> {
  const settings = await getUserSettings();
  enabled = computeEnabled(settings);
}

// React immediately to Settings toggle without re-reading AsyncStorage on
// every play. The Settings screen will call saveUserSettings → this listener
// updates the cached flag.
subscribeUserSettings((settings) => {
  if (settings) enabled = computeEnabled(settings);
});

export function playSfx(name: SfxName): void {
  if (enabled === false) return;
  const player = players[name];
  if (!player) return;
  try {
    player.seekTo(0);
    // Web: catch the async AbortError too (see ttsService for the rationale).
    const ret = player.play() as unknown;
    if (ret && typeof (ret as PromiseLike<unknown>).then === 'function') {
      (ret as Promise<unknown>).catch(() => { /* silent */ });
    }
  } catch {
    // expo-audio occasionally rejects seekTo on a player mid-transition.
    // SFX miss is acceptable — never let it crash the review flow.
  }
}
